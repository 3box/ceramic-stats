import { CID } from 'multiformats/cid'
import { Metrics } from '@ceramicnetwork/metrics'
import { StreamID } from '@ceramicnetwork/streamid'
import { IpfsApi } from '@ceramicnetwork/common'
import convert from 'blockcodec-to-ipld-format'
import path from 'path'
import cloneDeep from 'lodash.clonedeep'
import * as ipfsClient from 'ipfs-http-client'
import * as u8a from 'uint8arrays'
import lru from 'lru_map'
import * as dagJose from 'dag-jose'
import debug from 'debug'
import db from './db.js'

const IPFS_GET_TIMEOUT = 5000 // 5 seconds per retry, 2 retries = 10 seconds total timeout
const IPFS_API_URL = process.env.IPFS_API_URL || 'http://localhost:5001'
const IPFS_PUBSUB_TOPIC = process.env.IPFS_PUBSUB_TOPIC || '/ceramic/dev-unstable'
const IPFS_GET_RETRIES = Number(process.env.IPFS_GET_RETRIES) || 2
const IPFS_CACHE_SIZE = 1024 // maximum cache size of 256MB
const METRICS_PORT = Number(process.env.METRICS_EXPORTER_PORT) || 9464

const error = debug('ceramic:agent:error')
const log = debug('ceramic:agent:log')
log.log = console.log.bind(console)

const handledMessages = new lru.LRUMap(10000)
const dagNodeCache = new lru.LRUMap<string, any>(IPFS_CACHE_SIZE)

Metrics.start({metricsExporterEnabled: true, metricsPort: METRICS_PORT})
Metrics.count('agent-HELLO', 1, {'test_version': 1})

const OPERATIONS = {
    0: 'UPDATE',
    1: 'QUERY',
    2: 'RESPONSE',
    3: 'KEEPALIVE'  // not measured
}

let ipfs

async function main() {
    log('Connecting to ipfs at url', IPFS_API_URL)
    ipfs = await createIpfs(IPFS_API_URL)
    await ipfs.pubsub.subscribe(IPFS_PUBSUB_TOPIC, handleMessage)
    log('Subscribed to pubsub topic', IPFS_PUBSUB_TOPIC)
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

    let parsedMessageData
    if (typeof message.data == 'string') {
        parsedMessageData = JSON.parse(message.data)
    } else {
        parsedMessageData = JSON.parse(new TextDecoder('utf-8').decode(message.data))
    }

    if (parsedMessageData.typ == 3) {
        // skip keepalives
        return
    }

    const operation = OPERATIONS[parsedMessageData.typ]
    Metrics.count(operation, 1)   // raw counts

    const { stream, tip, model } = parsedMessageData

    try {
        // handleTip replaces getHeader & handleCid
        // handleStream will do the genesis commit and replaces handleHeader
        console.log("The type was " + parsedMessageData.typ)
        await handleStreamId(stream, model, operation)
        if (tip) {
            await handleTip(tip)
        }
    } catch (err) {
        error('at handleMessage', err)
    }
}


/**
 * Record cid of the tip in the db
 * count occurance of an update
 **/
async function handleTip(cidString) {
    if (! cidString) return

    //handleTip
    //   if signature contains a capability - load the cacao capability - all will not have that
    //  See https://github.com/ceramicnetwork/js-ceramic/blob/develop/packages/core/src/store/pin-store.ts#L101-L107
    if (await isNewToDb(cidString, 'cid')) {
        console.log(cidString)
        // can we use StreamUtils.isSignedCommit() here?
    }

    //  ?? isnt this high overhead to calculate each time ??
    // also its probably more useful to know total unique over limited time period, as well as total unique overall?
    const { occurrences, totalUnique } = await save(cidString, 'cid')

    Metrics.count("TIP_RECEIVED", 1)
}

async function isNewToDb(key, prefix = '') {
    key = getPrefixedKey(key, prefix)
    try {
        await db.get(key)
    } catch (err) {
        if (err.notFound) {
            return true
        }
        error('at isNewToDb', err)
    }
    return false
}


/**
 * Returns cid payload from ipfs or null.
 * @param {string} cidString (not null)
 * @param {IPFS} ipfs
 */
async function getPayload(cidString, ipfs) {
    try {
        const record = (await ipfs.dag.get( CID.parse(cidString))).value
        if (record.link) {
            return (await ipfs.dag.get(record.link)).value
        }
        return record
    } catch (err) {
        error('at getPayload', err)
        return null
    }
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

    const genesis_commit = (await ipfs.dag.get(stream.cid)).value

    const family = genesis_commit?.header?.family

    console.log(JSON.stringify(genesis_commit.header))
    const owner = genesis_commit?.header?.controllers[0]
    const version = genesis_commit?.link?.version

    // All parameters of interest may be recorded,
    // as long as they are of low cardinality
    Metrics.count('stream', 1, {
                     'family' : family,
                     'owner'  : owner,
                     'model'  : model,
                     'oper'   : operation,
                     'type'   : stream_type,
                     'version': version })

    let { occurrences, totalUnique } = await save(streamIdString, 'streamId')
    Metrics.record('unique_stream_count', totalUnique)

    // if desired we can count unique streams per model, or per owner etc

    if (owner) {
        let {occurrences, totalUnique } = await save(owner, 'controller')
        Metrics.record('unique_owner_count', totalUnique)
    }

    return occurrences == 1
}


/**
 * Adds key to db and returns number of occurrences and number of total unique
 * values with the given prefix.
 * @param {string} key
 */
async function save(key, prefix = '') {
    let totalUnique
    let occurrences

    key = getPrefixedKey(key, prefix)

    occurrences = await _save(key)

    // prefix is already there so this just retrieves the unique count and increments it if key was new
    // TODO we could use a 10 min db to count uniques over last 10 min ie # users over time
    totalUnique = await _save(prefix, occurrences == 1)

    return { occurrences, totalUnique }
}


function getPrefixedKey(key, prefix) {
    if (prefix != '') {
        key = prefix + ':' + key
    }
    return key
}


async function _save(key, increment = true) {
    try {
        const value = await db.get(key)
        if (!increment) {
            return value
        }
        const nextValue = value + 1
        await db.put(key, nextValue)
        return nextValue
    } catch (err) {
        if (err.notFound) {
            const nextValue = 1
            await db.put(key, nextValue)
            return nextValue
        } else {
            throw err
        }
    }
}

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
