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
  return `${LOG_PATH}stats-'${suffix}.log`
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
    await handleNewDocId(doc)
    const isNewCid = await handleNewCid(tip)
    if (isNewCid) {
      await handleHeader(doc, tip, ipfs)
    }
  } catch (error) {
    console.error(error)
  }
}

/**
 * Tracks docId counts, logs, and returns true if it is new.
 * @param {string} docIdString
 * @returns {boolean}
 */
async function handleNewDocId(docIdString) {
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
async function handleNewCid(cidString) {
  if (!cidString) return false
  const { occurrences, totalUnique } = await save(cidString, 'cid')
  logCid(cidString, occurrences, totalUnique)
  return occurrences == 1
}

/**
 * Gets payload of cid and logs header contents.
 * @param {string} docId
 * @param {string} cid
 * @param {IPFS} ipfs
 */
async function handleHeader(docId, cid, ipfs) {
  const payload = await getPayload(cid, ipfs)
  if (payload) {
    await logHeader(payload.header, docId)
  }
}

async function getPayload(cid, ipfs) {
  try {
    const record = (await ipfs.dag.get(cid)).value
    if (record.link) {
      return (await ipfs.dag.get(record.link)).value
    }
    return record
  } catch (error) {
    console.error(error)
    return null
  }
}

function logDocId(docId, occurrences, totalUnique) {
  writeStream({ docId, occurrences, totalUnique }, docIdOutputPath)
}

function logCid(cid, occurrences, totalUnique) {
  writeStream({ cid, occurrences, totalUnique }, cidOutputPath)
}

async function logHeader(header, docId) {
  try {
    const { family } = header
    if (family) {
      const { occurrences, totalUnique } = await save(family, 'family')
      writeStream({ family, occurrences, totalUnique }, familyOutputPath)
    }

    if (family.toLowerCase() == 'idx') {
      const { occurrences, totalUnique } = await save(docId, 'family:idx')
      writeStream({ docId, occurrences, totalUnique }, idxOutputPath)
    } else if (family.toLowerCase() == '3id') {
      const { occurrences, totalUnique } = await save(docId, 'family:3id')
      writeStream({ docId, occurrences, totalUnique }, threeIdOutputPath)
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

/**
 * Adds key to db and returns number of occurrences and number of total unique
 * values with the given prefix.
 * @param {string} key
 */
async function save(key, prefix = '') {
  let totalUnique
  let occurrences

  if (prefix != '') {
    key = prefix + ':' + key
  }

  occurrences = await _save(key)
  totalUnique = await _save(prefix, occurrences == 1)

  return { occurrences, totalUnique }
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
