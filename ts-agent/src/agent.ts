import { CID } from 'multiformats/cid'
import { IpfsDaemon } from '@ceramicnetwork/ipfs-daemon'
import IpfsHttpClient from 'ipfs-http-client'
import convert from 'blockcodec-to-ipld-format'
import dagJose from 'dag-jose'
import path from "path"
import debug from 'debug'

const CERAMIC_NETWORK = process.env.CERAMIC_NETWORK || 'dev-unstable'
const IPFS_API_URL = process.env.IPFS_API_URL || 'http://localhost:5001'
const IPFS_PUBSUB_TOPIC = process.env.IPFS_PUBSUB_TOPIC || '/ceramic/dev-unstable'

const error = debug('ceramic:agent:error')
const log = debug('ceramic:agent:log')
log.log = console.log.bind(console)

log("hi")
let ipfs

async function main() {
    ipfs = await createIpfs(IPFS_API_URL)
    await ipfs.pubsub.subscribe(IPFS_PUBSUB_TOPIC, handleMessage)
    log('Subscribed to pubsub topic', IPFS_PUBSUB_TOPIC)
    log('Ready')
}

/**
 * Returns IPFS instance. Given url, uses ipfs http client.
 *
 * NOTE: IPFS nodes are not designed for multi-client usage. When using pubsub,
 * the IPFS url should not be shared between multiple clients.
 */
async function createIpfs(url) {
    let ipfs

    log('Starting ipfs...')
    if (url) {
        const dagJoseFormat = convert.convert(dagJose)
        const ipld = { formats: [dagJoseFormat] }
        ipfs = await IpfsHttpClient.create(url, ipld)
    } else {
        const config = {
            ipfsPath: path.join(__dirname, '../ipfs'),
            ceramicNetwork: CERAMIC_NETWORK
        }
        let ipfsDaemon = await IpfsDaemon.create(config)
        await ipfsDaemon.start()
        ipfs = ipfsDaemon.ipfsd
    }
    return ipfs
}