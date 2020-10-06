var fs = require('fs')
var readLastLine = require('read-last-line')
var Queue = require('better-queue');
var watch = require('node-watch')

const set = {}

const logDirectory = '/usr/local/var/log/ceramic/'
const logFilename = 'stats-docids.log'
const logPath = logDirectory + logFilename
 
async function main() {
  const watcher = watch(logDirectory, {
      recursive: true,
      filter: function (filename) {
        return (filename.endsWith('-docids.log') && !filename.includes(logFilename))
      }
    }
  )

  const queue = new Queue(function (input, cb) {
    logNewDocIds(input)
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

function logNewDocIds(filename) {
  readLastLine.read(filename, 1)
    .then(function (lines) {
      lines = lines.trim()
      if (isNew(lines)) log(lines)
    })
    .catch(function (err) {
      console.error(err.message)
    })
}

function isNew(docId) {
  // TODO: Check valid docId format
  if (set[docId] === undefined) {
    set[docId] = 1
    return true
  }
  set[docId]++
  return false
}

function log(docId) {
  const logMessage = JSON.stringify({timestamp: Date.now(), docId})

  const stream = fs.createWriteStream(logPath, { flags: 'a' })
  stream.write(logMessage + '\n')
  stream.end()

  console.log(logMessage)
}

main()
  .then(function () {})
  .catch(function (err) {
      console.error(err)
      process.exit(1)
  })
