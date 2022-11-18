import cloneDeep from 'lodash.clonedeep'
import * as ipfsClient from 'ipfs-http-client'
import * as u8a from 'uint8arrays'
import lru from 'lru_map'
import * as dagJose from 'dag-jose'
import debug from 'debug'
//import { bisectLeft } from 'd3-array'

import { CID } from 'multiformats/cid'
import { ServiceMetrics as Metrics } from '@ceramicnetwork/observability'
import { StreamID } from '@ceramicnetwork/streamid'
import { base64urlToJSON } from '@ceramicnetwork/common'
import { PubsubKeepalive } from './pubsub-keepalive.js'
//import convert from 'blockcodec-to-ipld-format'

import db from './db.js'

const IPFS_API_URL = process.env.IPFS_API_URL || 'http://localhost:5001'
const IPFS_PUBSUB_TOPIC = process.env.IPFS_PUBSUB_TOPIC || '/ceramic/dev-unstable'

const IPFS_GET_TIMEOUT = 5000 // 5 seconds per retry, 2 retries = 10 seconds total timeout
const IPFS_GET_RETRIES = Number(process.env.IPFS_GET_RETRIES) || 1  // default to no retry

const COLLECTOR_HOST = process.env.COLLECTOR_HOST || ''

const MAX_PUBSUB_PUBLISH_INTERVAL = 60 * 1000 // one minute
const MAX_INTERVAL_WITHOUT_KEEPALIVE = 24 * 60 * 60 * 1000 // one day

const error = debug('ceramic:ts-agent:error')
const log = debug('ceramic:ts-agent:log')
log.log = console.log.bind(console)


Metrics.start(COLLECTOR_HOST, 'agent')
Metrics.count('HELLO', 1, {'test_version': 2})

const DAY_TTL = 86400
const MO_TTL = 30 * DAY_TTL

const OPERATIONS = {
    0: 'UPDATE',
    1: 'QUERY',
    2: 'RESPONSE',
    3: 'KEEPALIVE'  // only sampled
}

enum LABELS {
    cacao = 'cacao',
    capacity = 'capacity',
    controller = 'controller',
    error = 'error',
    model = 'model',
    peer_id = 'peer_id',
    stream = 'stream',
    tip = 'tip',
    version = 'version_sample10'  // we are sampling version at 10% for now
}

const delay = async function (ms) {
    return new Promise<void>((resolve) => setTimeout(() => resolve(), ms))
}

let ipfs
let keepalive

let sample_base = 1
let IPFS_CACHE_SIZE = 1024
let IPFS_DAG_GET_TIMEOUT
if (IPFS_PUBSUB_TOPIC == '/ceramic/mainnet') {
    sample_base = 1000
    IPFS_CACHE_SIZE = 4096 // maximum cache size of 1Gb
    IPFS_DAG_GET_TIMEOUT = 1024 // avoid ipfs requests piling up
} else if (IPFS_PUBSUB_TOPIC == '/ceramic/testnet-clay') {
    sample_base = 10
}
console.log(`Sampling keepalives at 1/${sample_base}`)

const handledMessages = new lru.LRUMap(10000)
const dagNodeCache = new lru.LRUMap<string, any>(IPFS_CACHE_SIZE)

let last_day = new Date()
const top_tens = {}
const top_ten_cnts = {}

async function main() {

    log('Connecting to ipfs at url', IPFS_API_URL)
    ipfs = await createIpfs(IPFS_API_URL)
    await ipfs.pubsub.subscribe(IPFS_PUBSUB_TOPIC, handleMessage)
    log('Subscribed to pubsub topic', IPFS_PUBSUB_TOPIC)

    log("Setting up keepalive")
    keepalive = new PubsubKeepalive(ipfs.pubsub, MAX_PUBSUB_PUBLISH_INTERVAL, MAX_INTERVAL_WITHOUT_KEEPALIVE)

    initTopTens()
    log('Ready')
}

/**
 * Returns IPFS client instance. Given url, uses ipfs http client.
 *
 * NOTE: IPFS nodes are not designed for multi-client usage. When using pubsub,
 * the IPFS url should not be shared between multiple clients.
 */
async function createIpfs(url) {
    try {
      return ipfsClient.create({
        url: IPFS_API_URL,
        ipld: {codecs: [dagJose]},
      })
    } catch (err) {
      log(`Error starting IPFS client - is IPFS running on ${IPFS_API_URL}?`)
      throw(err)
    }
}

async function handleMessage(message) {
    // dedupe

    const seqno = u8a.toString(message.seqno, 'base16')

    if (handledMessages.get(seqno)) {
        return
    } else {
        handledMessages.set(seqno, true)
    }


    const peer_id = message.from
    let parsedMessageData
    if (typeof message.data == 'string') {
        parsedMessageData = JSON.parse(message.data)
    } else {
        parsedMessageData = JSON.parse(new TextDecoder('utf-8').decode(message.data))
    }

    if (parsedMessageData.typ == 3) {
        // skip keepalives after we get the version
        // for now only sample the keepalives - maybe we are falling behind?

        if (Math.floor(Math.random() * sample_base) == 1) {
            await handleKeepalive(peer_id, parsedMessageData)
        }
        return
    }
    const operation = OPERATIONS[parsedMessageData.typ]
    if (Math.floor(Math.random() * sample_base) == 1) {
        await mark(peer_id, LABELS.peer_id)
    }
    Metrics.count(operation, 1)   // raw counts

    const { stream, tip, model } = parsedMessageData

    try {
        // handleTip may provide cacao information
        let cacao = ''
        if (tip) {
            cacao = await handleTip(tip, operation)
        }

        // handleStream will do the genesis commit and replaces handleHeader
        await handleStreamId(stream, model, operation, cacao)

    } catch (err) {
        Metrics.count(LABELS.error, 1, {'operation': operation})
        console.log("Error at handle message " + err)
        error('at handleMessage', err)
    }
}


/**
 * Record cid of the tip in the db
 * count occurance of an update
 **/
async function handleTip(cidString, operation) {
    if (! cidString) return ''

    //handleTip
    //   if signature contains a capability - load the cacao capability - all will not have that
    //  See https://github.com/ceramicnetwork/js-ceramic/blob/develop/packages/core/src/store/pin-store.ts#L101-L107
    let cacao_label = ''
    const commit = await _getFromIpfs(cidString)

    if (!commit || !commit.signatures || commit.signatures.length === 0) return

    const protectedHeader = commit.signatures[0].protected
    const decodedProtectedHeader = base64urlToJSON(protectedHeader)

    const capIPFSUri = decodedProtectedHeader.cap
    if (! capIPFSUri) return
    const capCIDString = capIPFSUri.replace('ipfs://', '')
    const capCID = CID.parse(capCIDString)
    // Metrics.count(LABELS.capacity, 1, {'code':capCID.code})
    try {
        let cacao =  await _getFromIpfs(capCIDString)
        if (! cacao) {
            cacao = await _getFromIpfs(capCID)
        }
        if (cacao) {
            Metrics.count(LABELS.cacao, 1, {'cacao': cacao.p.domain, 'operation':operation})
            cacao_label = cacao.p.domain
            // await mark(cacao.p.domain, LABELS.cacao)
        }
    } catch (err) {
        Metrics.count(LABELS.error, 1, {'action': 'cacao'})
        console.log(`Error trying to load capability ${capCID} from IPFS: ${err}`)
        error(`Error trying to load capability ${capCID} from IPFS: ${err}`)
    }
    return cacao_label
    //await mark(cidString, LABELS.tip)
}

async function handleKeepalive(peer_id, messageData) {

    const version = messageData.ver || '<2.4'  // when we started tracking version
    Metrics.count(LABELS.version, 1, {'version': version})

    // this gives more info but may be too noisy to handle
    //await mark(peer_id, LABELS.version + '.' + messageData.ver)
    // could also do it like so
    // await mark(peer_id + '@' + messageData.ver, LABELS.version)
    // or maybe just keep version by peer id and then associate it with the cacao app?
}


// and also see https://github.com/haardikk21/cacao-poc for generating tests
// also just count updates by stream and by who (DID)


/**
 * Handle the stream and load the genesis commit if we don't already have it
 * This gives us datamodel and did
 * Also track streamId counts, and emit metrics
 * Returns true if it is new.
 * @param {string} streamIdString
 * @returns {boolean}
 */
async function handleStreamId(streamIdString, model=null, operation='', cacao='') {
    // use streamid library here to decode streamid TODO - see js-ceramic
    // from decoded streamid get cid of genesis commit
    // load from ipfs and get header from there
    // if the payload is still a cid then load it again
    // this will include handleHeader as well

    // see https://github.com/ceramicnetwork/CIP/blob/main/CIPs/CIP-59/CIP-59.md

    if (!streamIdString) return false


    const stream = StreamID.fromString(streamIdString)
    const stream_type = stream.typeName  // tile or CAIP-10
    const genesis_commit = await _getFromIpfs(stream.cid)

    let family = ''
    const params = {cacao: cacao, family: family}

    if (genesis_commit) {
        family = genesis_commit?.header?.family

        if (family && (family.length > 32)) {
            family = 'commit_string'
        }
        family = family.replace(/:.*$/, '')
        params['family'] = family
        //console.log(JSON.stringify(genesis_commit.header))

        // TODO deal with multiple controllers - is this possible?
        const controller = genesis_commit?.header?.controllers[0]
        if (controller) {
            await mark(controller, LABELS.controller, false, false, params)
        }
    }

// TODO next lets see if we can tell a human-readable model name?
 /*   if (model) {
        const model_stream = StreamID.fromString(model)
        console.log("Looking for commit for model: " + model)
        let model_commit =  await _getFromIpfs(model)
    }
    */

    await mark(streamIdString, LABELS.stream, false, false, params)

    if (model) {
        await mark(model, LABELS.model, false, false, params)
    }

    // All parameters of interest may be recorded,
    // as long as they are of low cardinality
    // This gives us current velocity by parameter
    Metrics.count(LABELS.stream, 1, {
                     'family' : family,
                     'oper'   : operation,
                     'type'   : stream_type,
                     'cacao'  : cacao
    })
}

/**
 * get value from leveldb or return 0 if not found
 * @param key
 */
async function get_or_zero(key) {
    try {
        return await db.get(key)
    } catch (err) {
        if (err.notFound) {
            return 0
        } else {
            throw err
        }
    }
}

/**
 * Adds/updates key to db with day and month ttl, marks new_today, new_this_month
 * 
 * Count of the unique will be sent to Prometheus which will do the aggregation over time windows
 *
 * @param {string} key
 */
async function mark(key, label, track_top_ten = false, track_histogram = false, params = null) {

    const day_key = label + ':D:' + key
    const mo_key = label + ':' + key

    const seen_today = await get_or_zero(day_key)
    const seen_month = await get_or_zero(mo_key)

    // may want to do this or just use the topk in promql based on uniques
    // generally they are interested in uniques so may not need to do this
    // keep counts so later we can generate a top-10 for day and month

    let count_params = params
    if (count_params == null) {
        const count_params = {} // avoid defaulting to empty hash as parameter for memory leaks
    }

    if (! seen_today) {
        Metrics.count(label + '_uniq_da', 1, count_params)  // for daily uniq counts
        await db.put(day_key, 1, {ttl: DAY_TTL})
    }
    if (! seen_month) {
        Metrics.count(label + '_uniq_mo', 1, count_params) // for monthly uniq counts
        await db.put(mo_key, 1, {ttl: MO_TTL})
    }

    if (track_histogram) {
        Metrics.record(label + '_counts_da', seen_today + 1)  // for a Histogram by day
    }

    if (track_top_ten) {
        console.log("Top ten not implemented yet")
        // updateTopTen(key, label, seen_today)
    }

}

function initTopTens() {
    for (let label of Object.values(LABELS)) {
        top_tens[label] = []
        top_ten_cnts[label] = []
    }
}

/*
function updateTopTen(id:string, label:string, cnt: number) {

    const today = new Date()
     // instead of new day we should just keep circular buffer
    // is it a new day?  Reset our counts
    if (today != last_day) {
        last_day = today
        initTopTens()
    }

    let top_ten = top_tens[label]
    let top_ten_cnt = top_ten_cnts[label]
    if (top_ten.length < 10) {
        top_ten.push( id )
        top_ten_cnt.push( cnt )
        return
    }

    if (cnt <= top_ten_cnt[9]) {
       return  // nothing to write home about
    }

    let pos = bisectLeft(top_ten_cnt, cnt)
    top_ten.splice(pos, 0, id)
    top_ten_cnt.splice(pos, 0, cnt)
    top_ten.pop()
    top_ten_cnt.pop()

    top_ten.forEach((id, n) => {
        Metrics.record(label+'_top_ten', top_ten_cnt[n], {'id': id})
    })
}
*/


/**
 * Helper function for loading a CID from IPFS
 */
async function _getFromIpfs(cid: CID | string): Promise<any> {
    const asCid = typeof cid === 'string' ? CID.parse(cid) : cid

    const asCidString = typeof cid === 'string' ? cid : cid.toString()

    // Lookup CID in cache before looking it up IPFS
    const cachedDagNode = await dagNodeCache.get(asCidString)
    if (cachedDagNode) return cloneDeep(cachedDagNode)

    // Now lookup CID in IPFS, with retry logic
    // Note, in theory retries shouldn't be necessary, as just increasing the timeout should
    // allow IPFS to use the extra time to find the CID, doing internal retries if needed.
    // Anecdotally, however, we've seen evidence that IPFS sometimes finds CIDs on retry that it
    // doesn't on the first attempt, even when given plenty of time to load it.
    let dagResult = null
    for (let retries = IPFS_GET_RETRIES - 1; retries >= 0 && dagResult == null; retries--) {
        try {
            dagResult = await ipfs.dag.get(asCid)
            console.log("Got a dag result")
        } catch (err) {
            if (
                err.code == 'ERR_TIMEOUT' ||
                err.name == 'TimeoutError' ||
                err.message == 'Request timed out'
            ) {
                console.warn(
                    `Timeout error while loading CID ${asCid.toString()} from IPFS. ${retries} retries remain`
                )
                if (retries > 0) {
                    continue
                }
            }
            console.log("Some error")
            throw err
        }
    }
    // CID loaded successfully, store in cache
    if (dagResult) {
        await dagNodeCache.set(asCidString, dagResult.value)
        return cloneDeep(dagResult.value)
    } else {
        return null
    }
}


main()
    .then(function () { })
    .catch(async function (err) {
        if (ipfs) {
            await ipfs.stop()
            console.log("An ipfs error occurred")
        }
        console.error(err)
        process.exit(1)
    })
