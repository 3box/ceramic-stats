var dagJose = require('dag-jose')
var Ipfs = require('ipfs')
var fs = require('fs')
var legacy = require('multiformats/legacy')
var multiformats = require('multiformats/basics')
var readLastLine = require('read-last-line')
var watch = require('node-watch')

const docIdSet = {}

const logDirectory = '/var/log/ceramic/'

const docIdLogName = 'stats-docids.log'
const threeIdLogName = 'stats-3ids.log'

const docIdLogPath = logDirectory + docIdLogName
const threeIdLogPath = logDirectory + threeIdLogName

// TODO: other tags, schema, owners
 
async function main() {
  const ipfs = await createIpfs()
  const watcher = watch(logDirectory, { recursive: true, filter: watchFilter })

  watcher.on('ready', function() {
    console.log('Watcher is ready.')
  }) 

  watcher.on('change', async function(evt, filename) {
    if (evt === 'update') {
      const docId = await getNewDocId(filename)
      if (docId) {
        logDocId(docId)
        await logIf3id(docId, ipfs)
      }
    }
  })

  watcher.on('error', function(err) {
    console.error(err)
  })
}

async function createIpfs() {
  multiformats.multicodec.add(dagJose.default)
  const format = legacy(multiformats, dagJose.default.name)
  console.log('Starting ipfs...')
  return await Ipfs.create({ ipld: { formats: [format] } })
}

function watchFilter(filename) {
  return (
    !filename.includes(docIdLogName)
    && !filename.includes(threeIdLogName)
    && filename.endsWith('-docids.log')
  )
}

async function getNewDocId(filename) {
  return await readLastLine.read(filename, 1)
    .then(function (lines) {
      lines = lines.trim()
      return isNewDocId(lines) && lines || null
    })
    .catch(function (err) {
      console.error(err.message)
    })
}

function isNewDocId(docId) {
  // TODO: Check valid docId format
  if (docIdSet[docId] === undefined) {
    docIdSet[docId] = 1
    return true
  }
  docIdSet[docId]++
  return false
}

function logDocId(docId) {
  writeStream(docId, docIdLogPath, 'New docId:')
}

async function logIf3id(docId, ipfs) {
  const payload = await getDocPayload(docId, ipfs)
  
  let is3id = false
  try {
    is3id = payload.header.tags.includes('3id')
  } catch (error) {
    // pass
  }
  if (is3id) {
    writeStream(docId, threeIdLogPath, 'New 3id:')
  }
}

async function getDocPayload(docId, ipfs) {
  const cidIndex = 2
  const cid = docId.split('/')[cidIndex]
  const record = (await ipfs.dag.get(cid)).value
  return (await ipfs.dag.get(record.link)).value
}

function writeStream(docId, logPath, logHeader) {
  const logMessage = JSON.stringify({timestamp: Date.now(), docId})

  const stream = fs.createWriteStream(logPath, { flags: 'a' })
  stream.write(logMessage + '\n')
  stream.end()

  console.log(logHeader, logMessage)
}

main()
  .then(function () {})
  .catch(function (err) {
      console.error(err)
      process.exit(1)
  })
