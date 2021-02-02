const child_process = require('child_process')
const fs = require('fs')
const path = require('path')

const DocId = require('@ceramicnetwork/docid')
const dagJose = require('dag-jose')
const Ipfs = require('ipfs')
const IpfsHttpClient = require('ipfs-http-client')
const logfmt = require('logfmt')
const multiformats = require('multiformats/basics')
const legacy = require('multiformats/legacy')
const watch = require('node-watch')
const readLastLine = require('read-last-line')

const db = require('./db')

let LOG_PATH = process.env.LOG_PATH || '/logs/ceramic/'
const { IPFS_API_URL } = process.env

const cidOutputFile = 'stats-cid.log'
const docIdOutputFile = 'stats-docid.log'
const familyOutputFile = 'stats-family.log'
const controllerOutputFile = 'stats-controller.log'
const schemaOutputFile = 'stats-schema.log'
const tagOutputFile = 'stats-tag.log'

const outputFiles = [
  cidOutputFile,
  docIdOutputFile,
  familyOutputFile,
  controllerOutputFile,
  schemaOutputFile,
  tagOutputFile
]

const cidOutputPath = LOG_PATH + cidOutputFile
const docIdOutputPath = LOG_PATH + docIdOutputFile
const familyOutputPath = LOG_PATH + familyOutputFile
const controllerOutputPath = LOG_PATH + controllerOutputFile
const schemaOutputPath = LOG_PATH + schemaOutputFile
const tagOutputPath = LOG_PATH + tagOutputFile

let watcher

async function main() {
  if (!LOG_PATH.endsWith('/')) LOG_PATH += '/'
  const ipfs = await createIpfs(IPFS_API_URL)

  let watching = false

  while (!watching) {
    try {
      watcher = watch(LOG_PATH, { recursive: true, filter: watchFilter })
      watching = true
    } catch (error) {
      console.error(error)
      console.log('Will retry instantiating watcher after 10 seconds...')
      child_process.execSync('sleep 10')
    }
  }

  // TODO: Should we handle files found on startup? Could result in duplicate counts
  watcher.on('ready', async function () {
    console.log('Watcher is ready.')
  })

  watcher.on('change', async function (evt, filePath) {
    if (evt === 'update') {
      await handleFile(filePath, ipfs)
    }
  })

  watcher.on('error', function (err) {
    console.error(err)
  })
}

/**
 * Returns IPFS instance. Given url, uses ipfs http client.
 */
async function createIpfs(url) {
  let ipfs

  multiformats.multicodec.add(dagJose.default)
  const format = legacy(multiformats, dagJose.default.name)
  let ipld = { formats: [format] }

  console.log('Starting ipfs...')
  if (url) {
    ipfs = await IpfsHttpClient({ url, ipld })
  } else {
    ipfs = await Ipfs.create({ ipld, repo: path.join(__dirname, '../ipfs') })
  }
  return ipfs
}

/**
 * Returns true if this file should be watched.
 * @param {string} filename
 */
function watchFilter(filename) {
  console.log('watchFilter saw', filename)
  return (
    !outputFiles.includes(path.basename(filename)) && filename.endsWith('-docids.log')
  )
}

/**
 * Gets any docId from the file and logs it to output files.
 * @param {string} filePath
 * @param {IPFS} ipfs
 */
async function handleFile(filePath, ipfs) {
  try {
    const docId = await handleNewDocId(filePath)
    if (docId) {
      const cid = await handleNewCid(docId)
      if (cid) {
        await handleHeader(cid, ipfs)
      }
    }
  } catch (error) {
    console.error(error)
  }
}

/**
 * Parses last line of file and returns it if it is a docId.
 * @param {string} filePath
 * @returns {DocId}
 */
async function handleNewDocId(filePath) {
  return await readLastLine.read(filePath, 1)
    .then(async function (lines) {
      lines = lines.trim()
      const docId = DocId.default.fromString(lines)
      const docIdString = docId.toString()
      const { occurrences, totalUnique } = await save(docIdString, 'docId')
      logDocId(docIdString, occurrences, totalUnique)
      return docId
    })
}

/**
 * Returns cid from given docId if it is new.
 * @param {DocId} docId
 * @returns {string | null}
 */
async function handleNewCid(docId) {
  const cid = docId.cid.toString()
  const { occurrences, totalUnique } = await save(cid, 'cid')
  logCid(cid, occurrences, totalUnique)
  if (occurrences == 1) {
    return cid
  }
}

/**
 * Gets payload of cid and logs header contents.
 * @param {string} cid
 * @param {IPFS} ipfs
 */
async function handleHeader(cid, ipfs) {
  const payload = await getDocPayload(cid, ipfs)
  if (payload) {
    await logHeader(payload.header, ipfs)
  }
}

async function getDocPayload(cid, ipfs) {
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
  writeStream({ docId: docId.toString(), occurrences, totalUnique }, docIdOutputPath)
}

function logCid(cid, occurrences, totalUnique) {
  writeStream({ cid: cid.toString(), occurrences, totalUnique }, cidOutputPath)
}

async function logHeader(header) {
  try {
    const { family } = header
    if (family) {
      const { occurrences, totalUnique } = await save(family, 'family')
      writeStream({ family, occurrences, totalUnique }, familyOutputPath)
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
    if (watcher) {
      await watcher.close()
    }
    console.error(err)
    process.exit(1)
  })
