const path = require('path')

const level = require('level')

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../db')

const options = {
  keyEncoding: 'binary',
  valueEncoding: 'json'
};
const db = level(DB_PATH, options)

module.exports = db;
