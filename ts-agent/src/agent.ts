import { CID } from 'multiformats/cid'
import { IpfsDaemon } from '@ceramicnetwork/ipfs-daemon'
import dagJose from 'dag-jose'

const CERAMIC_NETWORK = process.env.CERAMIC_NETWORK || 'dev-unstable'
const { IPFS_API_URL } = process.env
const IPFS_PUBSUB_TOPIC = process.env.IPFS_PUBSUB_TOPIC || '/ceramic/dev-unstable'

console.log("hi")
