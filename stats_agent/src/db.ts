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
const db = ttl(level(DB_PATH, options))

export default db
