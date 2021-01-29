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

const outputFiles = [
  cidOutputFile,
  docIdOutputFile,
  familyOutputFile,
  controllerOutputFile,
  schemaOutputFile
]

const cidOutputPath = LOG_PATH + cidOutputFile
const docIdOutputPath = LOG_PATH + docIdOutputFile
const familyOutputPath = LOG_PATH + familyOutputFile
const controllerOutputPath = LOG_PATH + controllerOutputFile
const schemaOutputPath = LOG_PATH + schemaOutputFile

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
    fs.readdirSync(logDirectory).forEach(async function(file) {
      if (fs.lstatSync(path.resolve(logDirectory, file)).isDirectory()) {
        // TODO: Navigate recursively instead of passing here
      } else {
        watchFilter(file) && await handleFile(logDirectory + file, ipfs)
      }
    })
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
  console.log('Handling file', filePath)
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
      const occurrences = await save(docIdString)
      logDocId(docIdString, occurrences)
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
  const occurrences = await save(cid)
  logCid(cid, occurrences)
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
    return (await ipfs.dag.get(record.link)).value
  } catch (error) {
    console.error(error)
    return null
  }
}

function logDocId(docId, occurrences) {
  writeStream({ docId: docId.toString(), occurrences }, docIdOutputPath)
}

function logCid(cid, occurrences) {
  writeStream({ cid: cid.toString(), occurrences }, cidOutputPath)
}

async function logHeader(header) {
  try {
    const { family } = header
    if (family) {
      const occurrences = await save(family)
      writeStream({ family, occurrences }, familyOutputPath)
    }
  } catch (error) {
    console.warn('Failed to save family', error.message)
  }

  try {
    const { controllers } = header
    if (controllers) {
      for (controller of controllers) {
        const occurrences = await save(controller)
        writeStream({ controller, occurrences }, controllerOutputPath)
      }
    }
  } catch (error) {
    console.warn('Failed to save controllers', error.message)
  }

  try {
    const { schema } = header
    if (schema) {
      const occurrences = await save(schema)
      writeStream({ schema, occurrences}, schemaOutputPath)
    }
  } catch (error) {
    console.warn('Failed to save schema', error.message)
  }
}

/**
 * Adds key to db and returns number of occurrences.
 * @param {string} key
 */
async function save(key) {
  try {
    const value = await db.get(key)
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
