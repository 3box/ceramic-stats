import * as path from 'path'

import * as level from 'level'

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../db')

const options = {
  keyEncoding: 'binary',
  valueEncoding: 'json'
}
const db = level(DB_PATH, options)

//module.exports = db
export default db
