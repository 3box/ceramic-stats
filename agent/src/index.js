const fs = require('fs')
const path = require('path')

const { IpfsDaemon } = require('@ceramicnetwork/ipfs-daemon')
const dagJose = require('dag-jose')
const debug = require('debug')
const IpfsHttpClient = require('ipfs-http-client')
const logfmt = require('logfmt')
const LRUMap = require('lru_map')
const multiformats = require('multiformats/basics')
const legacy = require('multiformats/legacy')
const u8a = require('uint8arrays')

const db = require('./db')

const error = debug('agent:error')
const log = debug('agent:log')
log.log = console.log.bind(console)

let LOG_PATH = process.env.LOG_PATH || '/logs/ceramic/'
if (!LOG_PATH.endsWith('/')) LOG_PATH += '/'

const DEBUG = process.env.NODE_ENV == 'debug'
const CERAMIC_NETWORK = process.env.CERAMIC_NETWORK || 'dev-unstable'
const { IPFS_API_URL } = process.env
const IPFS_PUBSUB_TOPIC = process.env.IPFS_PUBSUB_TOPIC || '/ceramic/dev-unstable'

const cidOutputPath = outputPath('cid')
const controllerOutputPath = outputPath('controller')
const streamIdOutputPath = outputPath('streamid')
const familyOutputPath = outputPath('family')
const idxOutputPath = outputPath('idx')
const schemaOutputPath = outputPath('schema')
const tagOutputPath = outputPath('tag')
const threeIdOutputPath = outputPath('3id')

function outputPath(suffix) {
  return `${LOG_PATH}stats-${suffix}.log`
}

const handledMessages = new LRUMap(10000)

let ipfs

async function main() {
  if (!LOG_PATH.endsWith('/')) LOG_PATH += '/'
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
  let ipfs

  multiformats.multicodec.add(dagJose.default)
  const format = legacy(multiformats, dagJose.default.name)

  const ipld = { formats: [format] }

  log('Starting ipfs...')
  if (url) {
    ipfs = await IpfsHttpClient({ url, ipld })
  } else {
    const config = {
      ipfsPath: path.join(__dirname, '../ipfs'),
      ceramicNetwork: CERAMIC_NETWORK
    }
    ipfsDaemon = await IpfsDaemon.create(config)
    await ipfsDaemon.start()
    ipfs = ipfsDaemon.ipfs
  }
  return ipfs
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
    error(err)
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
    error(err)
    if (err.notFound) {
      return true
    }
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
    const record = (await ipfs.dag.get(cidString)).value
    if (record.link) {
      return (await ipfs.dag.get(record.link)).value
    }
    return record
  } catch (err) {
    error(err)
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
    const { family } = header
    if (family) {
      const { occurrences, totalUnique } = await save(family, 'family')
      writeStream({ family, occurrences, totalUnique }, familyOutputPath)
    }

    if (family.toLowerCase() == 'idx') {
      const { occurrences, totalUnique } = await save(streamId, 'family:idx')
      writeStream({ idx: streamId, occurrences, totalUnique }, idxOutputPath)
    } else if (family.toLowerCase() == '3id') {
      const { occurrences, totalUnique } = await save(streamId, 'family:3id')
      writeStream({ threeId: streamId, occurrences, totalUnique }, threeIdOutputPath)
    }

  } catch (err) {
    error('Failed to save family', err.message)
  }

  try {
    const { controllers } = header
    if (controllers) {
      for (controller of controllers) {
        const { occurrences, totalUnique } = await save(controller, 'controller')
        writeStream({ controller, occurrences, totalUnique }, controllerOutputPath)
      }
    }
  } catch (err) {
    error('Failed to save controllers', err.message)
  }

  try {
    const { schema } = header
    if (schema) {
      const { occurrences, totalUnique } = await save(schema, 'schema')
      writeStream({ schema, occurrences, totalUnique }, schemaOutputPath)
    }
  } catch (err) {
    error('Failed to save schema', err.message)
  }

  try {
    const { tags } = header
    if (tags) {
      for (tag of tags) {
        const { occurrences, totalUnique } = await save(tag, 'tag')
        writeStream({ tag, occurrences, totalUnique }, tagOutputPath)
      }
    }
  } catch (err) {
    error('Failed to save tag', err.message)
  }
}

function logStreamId(streamId, occurrences, totalUnique) {
  writeStream({ streamId, occurrences, totalUnique }, streamIdOutputPath)
}

function logCid(cid, occurrences, totalUnique) {
  writeStream({ cid, occurrences, totalUnique }, cidOutputPath)
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

function writeStream(data, logPath) {
  const logMessage = logfmt.stringify({ ts: Date.now(), ...data })

  const stream = fs.createWriteStream(logPath, { flags: 'a' })
  stream.write(logMessage + '\n')
  stream.end()

  log(logMessage)
}

main()
  .then(function () { })
  .catch(async function (err) {
    if (ipfs) {
      await ipfs.shutdown()
    }
    error(err)
    process.exit(1)
  })
