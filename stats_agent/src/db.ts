import path from 'path'
import { fileURLToPath } from 'url'
import level from 'level'
import ttl from 'level-ttl'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../db')

const options = {
  keyEncoding: 'binary',
  valueEncoding: 'json'
}

async function setup_db() {

    const _db = level(DB_PATH, options)
    console.log("Db status is " + _db.status)

    try {
      await _db.put('test_key', 1)        
    } catch(err) {
      console.log("ERROR opening level db: " + JSON.stringify(err))
      await _db.close()

      console.log("After close, db status is " + _db.status)
      await _db.open()

      console.log("After open, db status is " + _db.status)

      await _db.put('test_key', 1)
      console.log("Able to put a key")
    }

    console.log("Now creating the ttl db")
    return ttl(_db)
}

export default setup_db
