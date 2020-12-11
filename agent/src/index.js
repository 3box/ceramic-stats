var child_process = require('child_process')
var dagJose = require('dag-jose')
var Ipfs = require('ipfs')
var fs = require('fs')
var legacy = require('multiformats/legacy')
var multiformats = require('multiformats/basics')
var path = require('path')
var readLastLine = require('read-last-line')
var watch = require('node-watch')

const docIdSet = {}

const logDirectory = '/logs/ceramic/'

const docIdLogName = 'stats-docids.log'
const threeIdLogName = 'stats-3ids.log'

const docIdLogPath = logDirectory + docIdLogName
const threeIdLogPath = logDirectory + threeIdLogName

// TODO: other tags, schema, owners
 
async function main() {
  const ipfs = await createIpfs()

  let watcher
  let watching = false

  while (!watching) {
    try {
      watcher = watch(logDirectory, { recursive: true, filter: watchFilter })
      watching = true
    } catch (error) {
      console.error(error)
      console.log('Will retry instantiating watcher after 10 seconds...')
      child_process.execSync('sleep 10')
    }
  }

  watcher.on('ready', async function() {
    console.log('Watcher is ready.')
    fs.readdirSync(logDirectory).forEach(async function(file) {
      if (fs.lstatSync(path.resolve(logDirectory, file)).isDirectory()) {
        // TODO: Navigate recursively instead of passing here
      } else {
        watchFilter(file) && await handleFile(logDirectory + file, ipfs)
      }
    })
  }) 

  watcher.on('change', async function(evt, filePath) {
    if (evt === 'update') {
      await handleFile(filePath, ipfs)
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

async function handleFile(filePath, ipfs) {
  const docId = await getNewDocId(filePath)
  if (docId) {
    logDocId(docId)
    await logIf3id(docId, ipfs)
  }
}

async function getNewDocId(filePath) {
  return await readLastLine.read(filePath, 1)
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
  console.log('docId', docId)
  if (docIdSet[docId] === undefined) {
    docIdSet[docId] = 1
    console.log('new')
    return true
  }
  docIdSet[docId]++
  console.log('not new')
  return false
}

function logDocId(docId) {
  writeStream(docId, docIdLogPath, 'New docId:')
}

async function logIf3id(docId, ipfs) {
  const payload = await getDocPayload(docId, ipfs)
  
  let is3id = false
  if (payload) {
    try {
      is3id = payload.header.tags.includes('3id')
    } catch (error) {
      // pass
    }
    if (is3id) {
      writeStream(docId, threeIdLogPath, 'New 3id:')
    }
  }
}

async function getDocPayload(docId, ipfs) {
  const cidIndex = 2
  const cid = docId.split('/')[cidIndex]
  try {
    const record = (await ipfs.dag.get(cid)).value
    return (await ipfs.dag.get(record.link)).value
  } catch (error) {
    console.error(error)
    return null
  }
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
