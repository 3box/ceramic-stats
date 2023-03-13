import cloneDeep from 'lodash.clonedeep'
import * as ipfsClient from 'ipfs-http-client'
import * as u8a from 'uint8arrays'
import lru from 'lru_map'
import * as dagJose from 'dag-jose'
import debug from 'debug'
//import { bisectLeft } from 'd3-array'
import { DynamoDBClient, PutItemCommand, DescribeTableCommand, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb"

import { CID } from 'multiformats/cid'
import { ServiceMetrics as Metrics } from '@ceramicnetwork/observability'
import { StreamID } from '@ceramicnetwork/streamid'
import { base64urlToJSON } from '@ceramicnetwork/common'
import { PubsubKeepalive } from './pubsub-keepalive.js'
//import convert from 'blockcodec-to-ipld-format'

import winston from 'winston'

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs.log' })
  ]
})

logger.info("Start logs")

import initDb from './db.js'

const IPFS_API_URL = process.env.IPFS_API_URL || 'http://localhost:5001'
const IPFS_PUBSUB_TOPIC = process.env.IPFS_PUBSUB_TOPIC || '/ceramic/dev-unstable'

const COLLECTOR_HOST = process.env.COLLECTOR_HOST || ''
const ENV = process.env.ENV
console.log(`env is ${ENV}`)

const MAX_PUBSUB_PUBLISH_INTERVAL = 60 * 1000 // one minute
const MAX_INTERVAL_WITHOUT_KEEPALIVE = 24 * 60 * 60 * 1000 // one day

const AGENT_CID = 'agent_cid'

const error = debug('ceramic:ts-agent:error')
const log = debug('ceramic:ts-agent:log')
log.log = console.log.bind(console)

Metrics.start(COLLECTOR_HOST, 'agent')
Metrics.count('HELLO', 1, {'test_version': 2})

const DAY_TTL = 86400 * 1000
const MO_TTL = 30 * DAY_TTL

const DYN_UPDATE_INTERVAL = 3600 * 6 * 1000 // 6 hours
let dyn_last_described

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
    peer_versions = 'peer_versions',
    rebroadcast = 'rebroadcast',
    stream = 'stream',
    stream_model = 'stream_model',  // for temporary stream count by model
    tip = 'tip',
    version = 'version_sample10'  // we are sampling version at 10% for now
}

const DYN_TABLES = {
    [LABELS.stream] : `ceramic-${ENV}-grafana-stream`,
    [LABELS.controller] : `ceramic-${ENV}-grafana-did`,
    [LABELS.model] : `ceramic-${ENV}-grafana-model`
}

const DYN_KEYS = {
    [LABELS.stream] : 'cid',
    [LABELS.controller] : 'did',
    [LABELS.model] : 'mid'
}
const FIRST_SEEN = 'first_seen'

let ipfs
let db
let keepalive
let cli

let sample_base = 1
let IPFS_CACHE_SIZE = 1024
let IPFS_BASE_TIMEOUT = 4096  // set on create
let IPFS_DAG_GET_TIMEOUT = 4096  // on dag.get
let IPFS_GET_RETRIES = Number(process.env.IPFS_GET_RETRIES) || 1  // default to no retry

let REGION = process.env.AWS_REGION || 'us-east2'

if (IPFS_PUBSUB_TOPIC == '/ceramic/mainnet') {
    sample_base = 1000
    IPFS_CACHE_SIZE = 4096 // maximum cache size of 1Gb
    IPFS_DAG_GET_TIMEOUT = 1096 // avoid ipfs requests piling up
} else if (IPFS_PUBSUB_TOPIC == '/ceramic/testnet-clay') {
    sample_base = 10
}
console.log(`Sampling keepalives at 1/${sample_base}`)

const handledMessages = new lru.LRUMap(50000)
const fullMessages = new lru.LRUMap( 50000)
const peerVersions = new lru.LRUMap(1000)
const dagNodeCache = new lru.LRUMap<string, any>(IPFS_CACHE_SIZE)
const dagTimeoutCache = new lru.LRUMap<string, number>(IPFS_CACHE_SIZE)

const MAX_TIMEOUT_TRIES = 3  // give up trying to retrieve same stream over and over

let last_day = new Date()
const top_tens = {}
const top_ten_cnts = {}

async function main() {
    db = await initDb()
    console.log('Connecting to ipfs at url', IPFS_API_URL)
    ipfs = await createIpfs(IPFS_API_URL)
    await ipfs.pubsub.subscribe(IPFS_PUBSUB_TOPIC, handleMessage)
    console.log('Subscribed to pubsub topic', IPFS_PUBSUB_TOPIC)

    console.log("Setting up keepalive")
    keepalive = new PubsubKeepalive(ipfs.pubsub, MAX_PUBSUB_PUBLISH_INTERVAL, MAX_INTERVAL_WITHOUT_KEEPALIVE)

    console.log("Connecting to AWS")
    cli = new DynamoDBClient({region: REGION})

    await recordCumulativeMetrics()
    //initTopTens()
    console.log('Ready')
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
        timeout: IPFS_BASE_TIMEOUT,
        ipld: {codecs: [dagJose]},
      })
    } catch (err) {
      console.log(`Error starting IPFS client - is IPFS running on ${IPFS_API_URL}?`)
      throw(err)
    }
}

async function recordCumulativeMetrics() {
    // if we already recorded them recently, skip
    if (dyn_last_described && (Date.now() - dyn_last_described < DYN_UPDATE_INTERVAL)) {
        return
    }
    for (let [label, table] of Object.entries(DYN_TABLES)) {
        let cmd = new DescribeTableCommand({TableName: table})
        let response
        try {
           response = await cli.send(cmd)
        } catch (e) {
           console.log(`Error running Describe Table on ${table}: ${e.message}`)
           return
        }
        try {
           Metrics.record(`${label}_cum_uniq`, response.Table.ItemCount)
           Metrics.observe(`${label}_cum_uniq_observed`, response.Table.ItemCount)
        } catch (e) {
           console.log(`Error retrieving dynamodb counts: ${e.message}`)
        }
    }
    dyn_last_described = Date.now()
}

async function handleMessage(message) {
    // dedupe

    const seqno = u8a.toString(message.seqno, 'base16')

    const seen = handledMessages.get(seqno) as Array<string>
    if (seen) {
        let client = ''
        if (message.from in PEER_MAP) {
            client = PEER_MAP[message.from]['client']
        }
        if (message.from in seen) {
            Metrics.count(LABELS.rebroadcast, 1, {'peerid': message.from, 'same-peer-again': true, 'client': client})
        } else {
            seen.push(message.from)
            handledMessages.set(seqno, seen)
            console.log("OLD message: " + JSON.stringify(fullMessages.get(seqno)))
            logger.info("OLD message: " + JSON.stringify(fullMessages.get(seqno)))
            console.log("NEW message: " + JSON.stringify(message))
            logger.info("NEW message: " + JSON.stringify(message))
            fullMessages.set(seqno, message)
            Metrics.count(LABELS.rebroadcast, 1, {'peerid': message.from, 'same-peer-again': false, 'client': client})
        }
        return
    } else {
        fullMessages.set(seqno, message)
        handledMessages.set(seqno, [message.from])
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

        await handleKeepalive(peer_id, parsedMessageData)
        return
    }
    const operation = OPERATIONS[parsedMessageData.typ]
    if (Math.floor(Math.random() * sample_base) == 1) {
        await mark(peer_id, LABELS.peer_id)
    }
    Metrics.count(operation, 1)   // raw counts

    const { stream, tip, model } = parsedMessageData

    if (model) {
       console.log("Have a model!")
    }

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
        error(`Error trying to load capability ${capCID} from IPFS: ${err}`)
    }
    return cacao_label
    //await mark(cidString, LABELS.tip)
}

const PEER_MAP = {
'12D3KooWAZe34Cpnwjfw5aFobQFfXRufAye6hTaNJmkRj7Lx9uXW':{'ips':'134.209.122.31,18.159.71.239','client':'MAYBE Unlock & Raid'},
'12D3KooWChEHQc9sGUpDeJsSQjXaLhHQ4AYup81zof9EenT3XXED':{'ips':'209.250.230.102,139.180.204.150','client':'MAYBE GoodDollar'},
'12D3KooWG3zvLfQNFboVYv4NPvNVCjR9erb6y93HjAhwu2QgPNNz':{'ips':'87.251.76.213,85.214.249.118','client':''},
'12D3KooWLATBVT1NPhtbsUzwB9z3UmWUvwGFBUzz9J18Ldu4HGwQ':{'ips':'35.84.164.207','client':''},
'12D3KooWR5gET55KxVDK3rJn87L8xLuvWvtr8vYHwMZUtSaVgmzc':{'ips':'162.55.216.67','client':'Wetez'},
'12D3KooWSUHiNNEzDfSHW62cqjEag6jcvmnpubNcUsNxgUcpRRjz':{'ips':'167.160.89.99,167.160.89.98','client':'Vaultec'},
'12D3KooWSVpg4eWMy6G4ecpoM5sk55srsaziwcP7YzdbbgRkApFA':{'ips':'89.58.19.134','client':''},
'QmQWMCaKt79GUnMEZr3V8ykD6B88D8KVhyxCtCFxyJDPcg':{'ips':'149.248.11.215','client':''},
'QmSbtkcka9qV5UH9U1RQrHnUZts27ghN6GbL5YdwfFqnng':{'ips':'104.248.2.197,144.126.248.72','client':'dClimate'},
'QmUiF8Au7wjhAF9BYYMNQRW5KhY7o8fq4RUozzkWvHXQrZ':{'ips':'3.136.68.99','client':''},
'QmXH9UN3aDcidZrqqaL6JdfA9aRD818U663DsE61AtHyqo':{'ips':'54.91.52.83','client':''},
'QmbZjQMujAQX2UWCKHk1LvJccW4dycKT1nLGKFHE2sp9TZ':{'ips':'146.190.196.39','client':'Geoweb'},
'QmQHTe4GoBmZ3GfZEfiFDWptFE7ij51QvYsuWGWi5kambc':{'ips':'18.167.27.19','client':'Ownership Labs'},
'QmQb86uUqpB8EsV1nCUvjLZm4FQSe8Bkaw8MXNSWKt8WxG':{'ips':'35.90.35.229,52.14.130.133','client':'MAYBE Mach 34'},
'QmS2hvoNEfQTwqJC4v6xTvK8FpNR2s6AgDVsTL3unK11Ng':{'ips':'18.133.117.245,159.223.128.197','client':''},
'QmVPNwwBtUC3fPTSSsVAgS1WMz1RbEzkDbDxU9BvatXWXZ':{'ips':'34.85.157.166,34.86.126.175','client':'Metagame'}
}

async function handleKeepalive(peer_id, messageData) {

    const version = messageData.ver || '<2.4'  // when we started tracking version

    // now we want to track every peer's latest version
    const timesec = Math.round(Date.now() / 1000)
    let ips = ''
    let client = ''
    let last_seen = peerVersions.get(peer_id)
    if (peer_id in PEER_MAP) {
        ips = PEER_MAP[peer_id]['ips']
        client = PEER_MAP[peer_id]['client']
    }

    // if this is a new peer id, the version is changed, or its been a day since we recorded last
    if (! last_seen || last_seen['ver'] != version || last_seen['time'] < timesec - 86400) {
       peerVersions.set(peer_id, {'ver': version, 'time': timesec})
       Metrics.count(LABELS.peer_versions, 1, {'peerid': peer_id, 'ver': version, 'ips':ips, 'client':client})
    }

    // original sampling method
    if (Math.floor(Math.random() * sample_base) == 1) {

       Metrics.count(LABELS.version, 1, {'version': version})

       // might not be that many unique peers 
       await mark(peer_id, LABELS.peer_id, false, false, {'version': messageData.ver})
       // can we keep version by peer id and then associate it with the cacao app?  do we have peer id elsewhere?
   }
}


// and also see https://github.com/haardikk21/cacao-poc for generating tests
// also just count updates by stream and by who (DID)

// for patterns like did:pkh:eip155:1:0xb9c5714089478a327f09197987f16f9e5d936e8a
// described in https://github.com/w3c-ccg/did-pkh/blob/main/did-pkh-method-draft.md
const METHOD_RE_1 = /^([^:]+:[^:]+:[^:]+):([^:]+):/
// for patterns like did:3:kjzl6cwe1jw148jvc42283tl1jvfh3adm2c3rvkxuq7tm7fdvvar0avd94stczn
const METHOD_RE_2 = /^([^:]+:[^:]+):/
// for patterns like 0x616bfd22c29e603edd2de5cd85fc60cbc71d3ebd@eip155:1
const METHOD_RE_3 = /\@([^:]+:[^:]+)$/

const HAS_UC_RE = /[A-Z]/

const METHODS = {
    'did:pkh:bip122': 'did:pkh (bip122)',
    'did:pkh:eip155': {
           '1': 'did:pkh (ETH)',
           '42220': 'did:pkh (CELO)',
           '137': 'did:pkh (POLY)',
          },
    'did:pkh:solana': 'did:pkh (SOL)',
    'did:pkh:tezos': 'did:pkh (TZ)',
    'eip155:1' : 'did:pkh (ETH)',
    'eip155:137' : 'did:pkh (POLY)',
    'eip155:42220': 'did:pkh (CELO)',
    'did:key': 'did:key',
    'did:3': '3ID'
}

function extractMethod(controller) {
    let matches = METHOD_RE_1.exec(controller)
    if (! matches) {
        matches = METHOD_RE_2.exec(controller)
    }
    if (! matches) {
        matches = METHOD_RE_3.exec(controller)
    }
    if (! matches) {
        console.log("No match for controller: " + controller)
        return "unknown"
    }

    let level1 = matches[1]
    if (! (level1 in METHODS)) {
        // If we don't recognize it, return the raw prefix
        return level1
    }

    // If we do, return the nice label
    let method1 = METHODS[level1]

    if (typeof method1 === 'string') {
        return method1
    }

    if (matches.length >= 3) {
        const level2 = matches[2]
        if (! (level2 in METHODS[level1])) {
            return `${level1}:${level2}`
        }
        return METHODS[level1][level2] 
    }
    // not a known pattern
    console.log("Unknown pattern in controller " + controller)
    return level1
}


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

        if (family) {
            if (family.length > 32) {
                family = 'commit_string'
            } else {
                family = family.replace(/:.*$/, '')
            }
        }
        params['family'] = family
        //console.log(JSON.stringify(genesis_commit.header))

        // TODO deal with multiple controllers - is this possible?
        const controller = genesis_commit?.header?.controllers[0]
        if (controller) {
            params['method'] = extractMethod(controller)
            await mark(controller, LABELS.controller, false, false, params)
        }
        if (genesis_commit?.header?.controllers.length > 1) {
            console.log(`More than one controller on ${stream.cid}`)
        }

        // Temp measurement of mixed-case controllers
        if (HAS_UC_RE.exec(controller)) {
           Metrics.count('did_case', 1, {'case': 'has_upper'})
        } else {
           Metrics.count('did_case', 1, {'case': 'lower'})
        }

    }

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

    // TODO next lets see if we can tell a human-readable model name?
    if (model) {
       Metrics.count(LABELS.stream_model, 1, {
           'oper': operation,
           'type': stream_type,
           'cacao': cacao,
           'model': model
       })
       // const model_stream = StreamID.fromString(model)
       // console.log("Looking for commit for model: " + model)
       // let model_commit =  await _getFromIpfs(model_stream.cid)
       // console.log("model commit: " + model_commit)
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

        // for now log the peer id and version first seen each day
        if (label == LABELS.peer_id) {
            console.log(`peer_id: ${key} ${params}`)
        }

    }
    if (! seen_month) {
        Metrics.count(label + '_uniq_mo', 1, count_params) // for monthly uniq counts
        await db.put(mo_key, 1, {ttl: MO_TTL})

        // also add to cumulative overall metrics
        if (label in DYN_TABLES) {
           let dyn_table = DYN_TABLES[label]
           let dyn_key = DYN_KEYS[label]
           let put_data = {
              TableName: dyn_table,
              Item: {
                 [dyn_key]: {'S':key},
                 [FIRST_SEEN]: {'S': new Date().toISOString()}
              },
              ConditionExpression: `attribute_not_exists(${dyn_key})`
           }
           // may need to change this to batchwriteitems as volume goes up
           try {
             let cmd = new PutItemCommand(put_data)
             await cli.send(cmd)
             // recordCumulativeMetrics will only act if interval has elapsed
             await recordCumulativeMetrics()
           } catch (e) {
             console.log('Error logging to dynamodb: ' + e.message)
           }
        }
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
    if (cachedDagNode) {
        Metrics.count(AGENT_CID, 1, {'status': 'cached'})
        return cloneDeep(cachedDagNode)
    }

    const numberTimeouts = await dagTimeoutCache.get(asCidString)
    if (numberTimeouts && numberTimeouts >= MAX_TIMEOUT_TRIES) {
        Metrics.count(AGENT_CID, 1, {'status': 'maxed_timeouts'})
        return null
    }

    // Now lookup CID in IPFS, with retry logic
    // Note, in theory retries shouldn't be necessary, as just increasing the timeout should
    // allow IPFS to use the extra time to find the CID, doing internal retries if needed.
    // Anecdotally, however, we've seen evidence that IPFS sometimes finds CIDs on retry that it
    // doesn't on the first attempt, even when given plenty of time to load it.
    let dagResult = null
    for (let retries = IPFS_GET_RETRIES - 1; retries >= 0 && dagResult == null; retries--) {
        try {
            dagResult = await ipfs.dag.get(asCid, IPFS_DAG_GET_TIMEOUT)
        } catch (err) {
            if (
                err.code == 'ERR_TIMEOUT' ||
                err.name == 'TimeoutError' ||
                err.message == 'Request timed out'
            ) {
                if (retries > 0) {
                    continue
                }
                let misses = await dagTimeoutCache.get(asCidString) || 0
                await dagTimeoutCache.set(asCidString, misses +1)
                Metrics.count(AGENT_CID, 1, {'status': 'timeout'})

            } else {
                Metrics.count(AGENT_CID, 1, {'status': 'error'})
                throw err
            }
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
        console.log("Error starting up - check IPFS is running")
        if (ipfs) {
            await ipfs.stop()
        }
        console.error(err)
        process.exit(1)
    })
