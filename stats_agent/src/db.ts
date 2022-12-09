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

async function initDb(): Promise<any> {
    console.log("Initializing database...")
    try {
        await delay(2000)
        return ttl(level(DB_PATH, options))
    } catch (err) {
        // sometimes it takes a few seconds to release the lock on restart
        console.log("Waiting for database after error " + err)
        await delay(10000)
        return ttl(level(DB_PATH, options))
    }
}

const delay = async function (ms) {
    return new Promise<void>((resolve) => setTimeout(() => resolve(), ms))
}

export default initDb
