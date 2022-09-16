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

try {
  const _db = level(DB_PATH, options)
  console.log("Db status is " + _db.status)
  const db = ttl(_db)
  await db.get('test_key')
} catch(err) {
  console.log("ERROR opening level db: " + JSON.stringify(err))
  await _db.close()

  console.log("After close, db status is " + _db.status)
  await _db.open()

  console.log("After open, db status is " + _db.status)

  await db.get('test_key')
  console.log("Able to try to get a key")
}

export default db
