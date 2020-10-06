var fs = require('fs')
var readLastLine = require('read-last-line')
var Queue = require('better-queue')
var watch = require('node-watch')

const docIdSet = {}
const threeIdSet = {}

const logDirectory = '/var/log/ceramic/'

const docIdLogName = 'stats-docids.log'
const threeIdLogName = 'stats-3ids.log'

const docIdLogPath = logDirectory + docIdLogName
const threeIdLogPath = logDirectory + threeIdLogName
 
async function main() {
  const watcher = watch(logDirectory, { recursive: true, filter: watchFilter })

  const queue = new Queue(function (input, cb) {
    logIfNew(input)
    cb(null, result)
  })

  watcher.on('ready', function() {
    console.log('Watcher is ready.')
  }) 

  watcher.on('change', function(evt, filename) {
    if (evt === 'update') {
      queue.push(filename)
    }
  })

  watcher.on('error', function(err) {
    console.error(err)
  })
}

function watchFilter(filename) {
  return (
    !filename.includes(docIdLogName)
    && !filename.includes(threeIdLogName)
    && (filename.endsWith('-docids.log') || filename.endsWith('-3ids.log'))
  )
}

function logIfNew(filename) {
  let isDocId = filename.endsWith('-docids.log')
  let is3id = filename.endsWith('-3ids.log')

  let isNew
  let logPath
  let logHeader
  if (isDocId) {
    isNew = isNewDocId
    logPath = docIdLogPath
    logHeader = 'New docId:'
  } else if (is3id) {
    isNew = isNew3id
    logPath = threeIdLogPath
    logHeader = 'New 3id:'
  } else {
    return
  }

  readLastLine.read(filename, 1)
    .then(function (lines) {
      lines = lines.trim()
      handleLine(lines, isNew, logPath, logHeader)
    })
    .catch(function (err) {
      console.error(err.message)
    })
}

function handleLine(line, isNew, logPath, logHeader) {
  if (isNew(line)) {
    writeStream(line, logPath, logHeader)
  }
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

function isNew3id(docId) {
  // TODO: Check valid docId format
  if (threeIdSet[docId] === undefined) {
    threeIdSet[docId] = 1
    return true
  }
  threeIdSet[docId]++
  return false
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
