import { CID } from 'multiformats/cid'
//import { IpfsDaemon } from '@ceramicnetwork/ipfs-daemon'
import { Metrics } from '@ceramicnetwork/metrics'
import { IpfsApi } from '@ceramicnetwork/common'
import convert from 'blockcodec-to-ipld-format'
import path from "path"
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

const error = debug('ceramic:agent:error')
const log = debug('ceramic:agent:log')
log.log = console.log.bind(console)

const handledMessages = new lru.LRUMap(10000)
const dagNodeCache = new lru.LRUMap<string, any>(IPFS_CACHE_SIZE)

Metrics.start()
let ipfs

async function main() {
    ipfs = await createIpfs(IPFS_API_URL)
    await ipfs.pubsub.subscribe(IPFS_PUBSUB_TOPIC, handleMessage)
    log('Subscribed to pubsub topic', IPFS_PUBSUB_TOPIC)
    log('Ready')
}

/**
 * Returns IPFS instance. Given url, uses ipfs http client.
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

    const { stream, tip } = parsedMessageData

    if (stream) {
        console.log(`GOT stream: ${stream}`)
    }
    if (tip) {
        console.log(`GOT tip: ${tip}`)
    }
    try {
        if (await isNewCid(tip)) {
            const header = await getHeader(tip)
            if (header && !isTestStream(stream, header)) {
                await handleStreamId(stream)
                await handleCid(tip)
                await handleHeader(header, stream)
            }
        }
    } catch (err) {
        error('at handleMessage', err)
    }
}

/**
 * Returns true if the cid is not already in the db.
 * @param {string} cidString
 */
async function isNewCid(cidString) {
    if (cidString) return await isNewToDb(cidString, 'cid')
    return false
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
 * Returns the header from cid payload or null
 * @param {string} cidString
 * @returns {Promise<any>} Header or null
 */
async function getHeader(cidString) {
    if (!cidString) return null
    const payload = await getPayload(cidString, ipfs)
    if (payload) return payload.header || null
    return null
}

/**
 * Returns cid payload from ipfs or null.
 * @param {string} cidString
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

/**
 * Returns true if family in header matches "test" family format
 * @param {any} header
 */
function isTestStream(streamIdString, header) {
    if (!header) return false
    if (!header.family) return false
    if (header.family.match(/test-(\d+)/)) {
        log('Skipping test stream with family', header.family, streamIdString)
        return true
    }
    return false
}

/**
 * Logs header contents.
 * @param {any} header
 * @param {string} streamId
 */
async function handleHeader(header, streamId) {
    if (header && streamId) await logHeader(header, streamId)
}

/**
 * Tracks streamId counts, logs, and returns true if it is new.
 * @param {string} streamIdString
 * @returns {boolean}
 */
async function handleStreamId(streamIdString) {
    if (!streamIdString) return false
    const { occurrences, totalUnique } = await save(streamIdString, 'streamId')
    logStreamId(streamIdString, occurrences, totalUnique)
    return occurrences == 1
}

/**
 * Tracks cid counts, logs, and returns true if it is new.
 * @param {string} cidString
 * @returns {boolean}
 */
async function handleCid(cidString) {
    if (!cidString) return false
    const { occurrences, totalUnique } = await save(cidString, 'cid')

    // get the genesis commit if we don't already have it
    // right now we never have it since we don't save them
    const genesis_commit = await _getFromIpfs(cidString)


    logCid(cidString, occurrences, totalUnique)
    return occurrences == 1
}

/**
 * Parses and logs header contents.
 * @param {any} header
 * @param {string} streamId
 */
async function logHeader(header, streamId) {
    try {
        const { family } = header // TODO THIS IS OUT OF DATE (I think)
        if (family) {
            const { occurrences, totalUnique } = await save(family, 'family')
            //writeStream({ family, occurrences, totalUnique }, familyOutputPath)
        }

        if (family.toLowerCase() == 'idx') {
            const { occurrences, totalUnique } = await save(streamId, 'family:idx')
            //writeStream({ idx: streamId, occurrences, totalUnique }, idxOutputPath)
        } else if (family.toLowerCase() == '3id') {
            const { occurrences, totalUnique } = await save(streamId, 'family:3id')
            //writeStream({ threeId: streamId, occurrences, totalUnique }, threeIdOutputPath)
        }

    } catch (err) {
        error('at logHeader', 'Failed to save family', err.message)
    }

    try {
        const { controllers } = header
        if (controllers) {
            for (let controller of controllers) {
                const { occurrences, totalUnique } = await save(controller, 'controller')
                Metrics.count("BY_CONTROLLER", 1, {'controller': controller}) // TODO add BY_CONTROLLER to metric names
                //writeStream({ controller, occurrences, totalUnique }, controllerOutputPath)
            }
        }
    } catch (err) {
        error('at logHeader', 'Failed to save controllers', err.message)
    }

    try {
        const { schema } = header
        if (schema) {
            const { occurrences, totalUnique } = await save(schema, 'schema')
            //writeStream({ schema, occurrences, totalUnique }, schemaOutputPath)
        }
    } catch (err) {
        error('at logHeader', 'Failed to save schema', err.message)
    }

    try {
        const { tags } = header
        if (tags) {
            for (let tag of tags) {
                const { occurrences, totalUnique } = await save(tag, 'tag')
                //writeStream({ tag, occurrences, totalUnique }, tagOutputPath)
            }
        }
    } catch (err) {
        error('at logHeader', 'Failed to save tag', err.message)
    }
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

function logStreamId(streamId, occurrences, totalUnique) {
    //writeStream({ streamId, occurrences, totalUnique }, streamIdOutputPath)
}

function logCid(cid, occurrences, totalUnique) {
    //writeStream({ cid, occurrences, totalUnique }, cidOutputPath)
}

main()
    .then(function () { })
    .catch(async function (err) {
        if (ipfs) {
            await ipfs.shutdown()
        }
        console.error(err)
        process.exit(1)
    })