const child_process = require('child_process')
const fs = require('fs')
const path = require('path')

const dagJose = require('dag-jose')
const Ipfs = require('ipfs')
const IpfsHttpClient = require('ipfs-http-client')
const logfmt = require('logfmt')
const LRUMap = require('lrumap')
const multiformats = require('multiformats/basics')
const legacy = require('multiformats/legacy')
const u8a = require('uint8arrays')

const db = require('./db')

let LOG_PATH = process.env.LOG_PATH || '/logs/ceramic/'
if (!LOG_PATH.endsWith('/')) LOG_PATH += '/'

const { IPFS_API_URL } = process.env
const IPFS_PUBSUB_TOPIC = process.env.IPFS_PUBSUB_TOPIC || '/ceramic/dev-unstable'

const cidOutputPath = outputPath('cid')
const controllerOutputPath = outputPath('controller')
const docIdOutputPath = outputPath('docid')
const familyOutputPath = outputPath('family')
const idxOutputPath = outputPath('idx')
const schemaOutputPath = outputPath('schema')
const tagOutputPath = outputPath('tag')
const threeIdOutputPath = outputPath('3id')

function outputPath(suffix) {
  return `${LOG_PATH}stats-${suffix}.log`
}

const bootstrapList = {
  '/ceramic/testnet-clay': [
    '/dns4/ipfs-clay-internal.3boxlabs.com/tcp/4012/wss/p2p/QmQotCKxiMWt935TyCBFTN23jaivxwrZ3uD58wNxeg5npi'
  ],
  '/ceramic/dev-unstable': [
    '/dns4/ipfs-dev-internal.3boxlabs.com/tcp/4012/wss/p2p/QmYkpxusRem2iup8ZAfVGYv7iq1ks1yyq2XxQh3z2a8xXq'
  ]
}

const handledMessages = new LRUMap({ limit: 10000 })

let ipfs

async function main() {
  if (!LOG_PATH.endsWith('/')) LOG_PATH += '/'
  ipfs = await createIpfs(IPFS_API_URL)
  await ipfs.pubsub.subscribe(IPFS_PUBSUB_TOPIC, handleMessage)
  console.log('Subscribed to pubsub topic', IPFS_PUBSUB_TOPIC, '\nReady')
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

  const config = { Bootstrap: bootstrapList[IPFS_PUBSUB_TOPIC] }
  const ipld = { formats: [format] }
  const libp2p = { config: { dht: { enabled: false } } }

  console.log('Starting ipfs...')
  if (url) {
    ipfs = await IpfsHttpClient({ url, ipld })
  } else {
    ipfs = await Ipfs.create({
      config,
      ipld,
      libp2p,
      repo: path.join(__dirname, '../ipfs'),
    })
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

  const { doc, tip } = parsedMessageData

  try {
    if (await isNewCid(tip)) {
      const header = await getHeader(tip)
      if (header && !isTestDoc(doc, header)) {
        await handleDocId(doc)
        await handleCid(tip)
        await handleHeader(header, doc)
      }
    }
  } catch (error) {
    console.error(error)
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
  } catch (error) {
    if (error.notFound) {
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
  } catch (error) {
    console.error(error)
    return null
  }
}

/**
 * Returns true if family in header matches "test" family format
 * @param {any} header
 */
function isTestDoc(docIdString, header) {
  if (!header) return false
  if (!header.family) return false
  if (header.family.match(/test-(\d+)/)) {
    console.log('Skipping test doc with family', header.family, docIdString)
    return true
  }
  return false
}

/**
 * Logs header contents.
 * @param {any} header
 * @param {string} docId
 */
async function handleHeader(header, docId) {
  if (header && docId) await logHeader(header, docId)
}

/**
 * Tracks docId counts, logs, and returns true if it is new.
 * @param {string} docIdString
 * @returns {boolean}
 */
async function handleDocId(docIdString) {
  if (!docIdString) return false
  const { occurrences, totalUnique } = await save(docIdString, 'docId')
  logDocId(docIdString, occurrences, totalUnique)
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
 * @param {string} docId
 */
async function logHeader(header, docId) {
  try {
    const { family } = header
    if (family) {
      const { occurrences, totalUnique } = await save(family, 'family')
      writeStream({ family, occurrences, totalUnique }, familyOutputPath)
    }

    if (family.toLowerCase() == 'idx') {
      const { occurrences, totalUnique } = await save(docId, 'family:idx')
      writeStream({ idx: docId, occurrences, totalUnique }, idxOutputPath)
    } else if (family.toLowerCase() == '3id') {
      const { occurrences, totalUnique } = await save(docId, 'family:3id')
      writeStream({ threeId: docId, occurrences, totalUnique }, threeIdOutputPath)
    }

  } catch (error) {
    console.warn('Failed to save family', error.message)
  }

  try {
    const { controllers } = header
    if (controllers) {
      for (controller of controllers) {
        const { occurrences, totalUnique } = await save(controller, 'controller')
        writeStream({ controller, occurrences, totalUnique }, controllerOutputPath)
      }
    }
  } catch (error) {
    console.warn('Failed to save controllers', error.message)
  }

  try {
    const { schema } = header
    if (schema) {
      const { occurrences, totalUnique } = await save(schema, 'schema')
      writeStream({ schema, occurrences, totalUnique }, schemaOutputPath)
    }
  } catch (error) {
    console.warn('Failed to save schema', error.message)
  }

  try {
    const { tags } = header
    if (tags) {
      for (tag of tags) {
        const { occurrences, totalUnique } = await save(tag, 'tag')
        writeStream({ tag, occurrences, totalUnique }, tagOutputPath)
      }
    }
  } catch (error) {
    console.warn('Failed to save tag', error.message)
  }
}

function logDocId(docId, occurrences, totalUnique) {
  writeStream({ docId, occurrences, totalUnique }, docIdOutputPath)
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
  } catch (error) {
    if (error.notFound) {
      const nextValue = 1
      await db.put(key, nextValue)
      return nextValue
    } else {
      throw error
    }
  }
}

function writeStream(data, logPath) {
  const logMessage = logfmt.stringify({ ts: Date.now(), ...data })

  const stream = fs.createWriteStream(logPath, { flags: 'a' })
  stream.write(logMessage + '\n')
  stream.end()

  console.log(logMessage)
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
