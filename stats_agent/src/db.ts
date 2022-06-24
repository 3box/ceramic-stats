import path from 'path'
import { fileURLToPath } from 'url';
import level from 'level'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../db')

const options = {
  keyEncoding: 'binary',
  valueEncoding: 'json'
}
const db = level(DB_PATH, options)

//module.exports = db
export default db
