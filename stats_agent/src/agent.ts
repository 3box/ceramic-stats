import cloneDeep from 'lodash.clonedeep'
import * as ipfsClient from 'ipfs-http-client'
import * as u8a from 'uint8arrays'
import lru from 'lru_map'
import * as dagJose from 'dag-jose'
import debug from 'debug'
//import { bisectLeft } from 'd3-array'

import { CID } from 'multiformats/cid'
import { Metrics } from '@ceramicnetwork/metrics'
import { StreamID } from '@ceramicnetwork/streamid'
import { base64urlToJSON } from '@ceramicnetwork/common'
import { PubsubKeepalive } from './pubsub-keepalive.js'
//import convert from 'blockcodec-to-ipld-format'

import db from './db.js'

const IPFS_GET_TIMEOUT = 5000 // 5 seconds per retry, 2 retries = 10 seconds total timeout
const IPFS_API_URL = process.env.IPFS_API_URL || 'http://localhost:5001'
const IPFS_PUBSUB_TOPIC = process.env.IPFS_PUBSUB_TOPIC || '/ceramic/dev-unstable'
const IPFS_GET_RETRIES = Number(process.env.IPFS_GET_RETRIES) || 2
const IPFS_CACHE_SIZE = 1024 // maximum cache size of 256MB
const METRICS_PORT = Number(process.env.METRICS_EXPORTER_PORT) || 9464

const MAX_PUBSUB_PUBLISH_INTERVAL = 60 * 1000 // one minute
const MAX_INTERVAL_WITHOUT_KEEPALIVE = 24 * 60 * 60 * 1000 // one day

const error = debug('ceramic:ts-agent:error')
const log = debug('ceramic:ts-agent:log')
log.log = console.log.bind(console)

const handledMessages = new lru.LRUMap(10000)
const dagNodeCache = new lru.LRUMap<string, any>(IPFS_CACHE_SIZE)

Metrics.start({metricsExporterEnabled: true, metricsPort: METRICS_PORT}, 'agent')
Metrics.count('HELLO', 1, {'test_version': 1})

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
if (IPFS_PUBSUB_TOPIC == '/ceramic/mainnet') {
    sample_base = 1000
} else if (IPFS_PUBSUB_TOPIC == '/ceramic/testnet-clay') {
    sample_base = 10
}
console.log(`Sampling keepalives at 1/${sample_base}`)

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
    return ipfsClient.create({
        url: IPFS_API_URL,
        ipld: {codecs: [dagJose]},
    })
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

    Metrics.count(operation, 1)   // raw counts

    const { stream, tip, model } = parsedMessageData

    try {
        // handleTip replaces getHeader & handleCid
        // handleStream will do the genesis commit and replaces handleHeader
        await handleStreamId(stream, model, operation)

        if (tip) {
            await handleTip(tip, operation)
        }
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
    if (! cidString) return

    //handleTip
    //   if signature contains a capability - load the cacao capability - all will not have that
    //  See https://github.com/ceramicnetwork/js-ceramic/blob/develop/packages/core/src/store/pin-store.ts#L101-L107

    const commit = (await ipfs.dag.get( CID.parse(cidString))).value

    if (!commit.signatures || commit.signatures.length === 0) return

    const protectedHeader = commit.signatures[0].protected
    const decodedProtectedHeader = base64urlToJSON(protectedHeader)

    const capIPFSUri = decodedProtectedHeader.cap
    if (! capIPFSUri) return
    const capCIDString = capIPFSUri.replace('ipfs://', '')
    const capCID = CID.parse(capCIDString)
    // Metrics.count(LABELS.capacity, 1, {'code':capCID.code})
    try {
        let cacao =  await dagNodeCache.get('cacao:'+capCIDString)
        if (! cacao) {
            cacao = (await ipfs.dag.get(capCID)).value
            if (cacao) {
                await dagNodeCache.set('cacao:'+capCIDString, cacao)
            }
        }
        if (cacao) {
            Metrics.count(LABELS.cacao, 1, {'cacao': cacao.p.domain, 'operation':operation})
            await mark(cacao.p.domain, LABELS.cacao)
        }
    } catch (err) {
        Metrics.count(LABELS.error, 1, {'action': 'cacao'})
        console.log(`Error trying to load capability ${capCID} from IPFS: ${err}`)
        error(`Error trying to load capability ${capCID} from IPFS: ${err}`)
    }

    //await mark(cidString, LABELS.tip)
}

async function handleKeepalive(peer_id, messageData) {

    Metrics.count(LABELS.version, 1, {'version': messageData.ver})

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
async function handleStreamId(streamIdString, model=null, operation='') {
    // use streamid library here to decode streamid TODO - see js-ceramic
    // from decoded streamid get cid of genesis commit
    // load from ipfs and get header from there
    // if the payload is still a cid then load it again
    // this will include handleHeader as well

    // see https://github.com/ceramicnetwork/CIP/blob/main/CIPs/CIP-59/CIP-59.md

    if (!streamIdString) return false

    const stream = StreamID.fromString(streamIdString)
    const stream_type = stream.typeName  // tile or CAIP-10
    let genesis_commit =  await dagNodeCache.get('g:'+streamIdString)
    if (! genesis_commit) {
        genesis_commit = (await ipfs.dag.get(stream.cid)).value
        await dagNodeCache.set('g:'+streamIdString, genesis_commit)
    }

    let family = genesis_commit?.header?.family

    if (family && (family.length > 32)) {
        family = 'commit_string'
    }

    //console.log(JSON.stringify(genesis_commit.header))

    // TODO deal with multiple controllers - is this possible?
    const controller = genesis_commit?.header?.controllers[0]

    // All parameters of interest may be recorded,
    // as long as they are of low cardinality
    // This gives us current velocity by parameter
    Metrics.count(LABELS.stream, 1, {
                     'family' : family,
                     'oper'   : operation,
                     'type'   : stream_type
    })

    await mark(streamIdString, LABELS.stream, false, false)

    if (model) {
        await mark(model, LABELS.model)
    }

    if (controller) {
        await mark(controller, LABELS.controller)
    }
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
async function mark(key, label, track_top_ten = false, track_histogram = false) {

    const day_key = label + ':D:' + key
    const mo_key = label + ':' + key

    const seen_today = await get_or_zero(day_key)
    const seen_month = await get_or_zero(mo_key)

    // TODO keep a circular buffer of buckets of counts
    // keep counts so later we can generate a top-10 for day and month

    if (! seen_today) {
        Metrics.count(label + '_uniq_da', 1)  // for daily uniq counts
        await db.put(day_key, 1, {ttl: DAY_TTL})
    }
    if (! seen_month) {
        Metrics.count(label + '_uniq_mo', 1) // for monthly uniq counts
        await db.put(mo_key, seen_today + 1, {ttl: MO_TTL})
    }

    if (track_histogram) {
        // this actually needs circular buffer of buckets for accuracy
        // bc the put keeps refreshing the ttl
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
async function _getFromIpfs(cid: CID | string, path?: string): Promise<any> {
    const asCid = typeof cid === 'string' ? CID.parse(cid) : cid

    // Lookup CID in cache before looking it up IPFS
    const cidAndPath = path ? asCid.toString() + path : asCid.toString()
    const cachedDagNode = await dagNodeCache.get(cidAndPath)
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

            throw err
        }
    }
    // CID loaded successfully, store in cache
    await dagNodeCache.set(cidAndPath, dagResult.value)
    return cloneDeep(dagResult.value)
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
