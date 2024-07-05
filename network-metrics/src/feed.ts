import { Pool } from 'pg';
import EventSource from 'eventsource';
import dotenv from 'dotenv';

dotenv.config();

// Database connection parameters
const DB_HOST = process.env.DB_HOST ?? '';
const DB_PORT = 5432;
const DB_USER = 'tsuser';
const DB_PASSWORD = process.env.DB_PASSWORD ?? '';
const DB_NAME = 'tsdb';

const ENDPOINT_URL = `https://${process.env.CERAMIC_HOSTNAME}/api/v0/feed/aggregation/documents`;
console.log("Endpoint: " + ENDPOINT_URL);

interface DataBatch {
    ts: Date;
    ceramicNode: {
        id: string;
        name: string;
        PeerID: string;
        IPAddress: string;
        ipfsVersion: string;
        nodeAuthDID: string;
        ceramicVersion: string;
    };
    recentErrors: string[];
    totalIndexedModels: number;
    totalPinnedStreams: number;
    maxAnchorRequestAgeMS: number;
    currentPendingRequests: number;
    meanAnchorRequestAgeMS: number;
    recentCompletedRequests: number;
}

interface ErrorBatch {
    ts: Date;
    ceramic_node_id: string;
    error: string;
}

const dataBatch: DataBatch[] = [];
const errorBatch: ErrorBatch[] = [];

function convertToDate(timestamp: string): Date {
    return new Date(timestamp);
}

async function listenEndpoint(): Promise<void> {
    const eventSource = new EventSource(ENDPOINT_URL, {
        headers: {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
        }
    });

    eventSource.onmessage = (event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data);
            const content = JSON.parse(data.content);

            content.ts = convertToDate(content.ts);
            dataBatch.push(content);

            for (const error of content.sampleRecentErrors || []) {
                errorBatch.push({
                    ts: content.ts,
                    ceramic_node_id: content.ceramicNode.id,
                    error: error
                });
            }
            console.log("Received data:", content);
        } catch (err) {
            console.error("Error parsing message:", err);
        }
    };

    eventSource.onerror = (err: Event) => {
        console.error("EventSource failed:", err);
    };
}

async function pushData(pool: Pool): Promise<void> {
    console.log("Going to push data:", dataBatch);
    if (dataBatch.length === 0) return;

    try {
        const client = await pool.connect();

        const insertQuery = `
            INSERT INTO network_metrics (ts, ceramic_node_id, ceramic_node_name, peer_id, ip_address, ipfs_version, node_auth_did, ceramic_version, recent_errors, total_indexed_models, total_pinned_streams, max_anchor_request_age_ms, current_pending_requests, mean_anchor_request_age_ms, recent_completed_requests)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `;

        for (const d of dataBatch) {
            if (! d.ceramicNode?.id) {
                console.log(`Invalid entry: ${d}`)
                continue;
            }
            await client.query(insertQuery, [
                d.ts,
                d.ceramicNode.id,
                d.ceramicNode.name,
                d.ceramicNode.PeerID,
                d.ceramicNode.IPAddress,
                d.ceramicNode.ipfsVersion,
                d.ceramicNode.nodeAuthDID,
                d.ceramicNode.ceramicVersion,
                d.recentErrors,
                d.totalIndexedModels,
                d.totalPinnedStreams,
                d.maxAnchorRequestAgeMS,
                d.currentPendingRequests,
                d.meanAnchorRequestAgeMS,
                d.recentCompletedRequests
            ]);
        }

        console.log(`Pushed ${dataBatch.length} records to the database.`);
        dataBatch.length = 0; // Clear the data batch after pushing

        const errorInsertQuery = `
            INSERT INTO network_errors (ts, ceramic_node_id, error)
            VALUES ($1, $2, $3)
        `;

        for (const e of errorBatch) {
            await client.query(errorInsertQuery, [e.ts, e.ceramic_node_id, e.error]);
        }

        console.log(`Pushed ${errorBatch.length} error records to the database.`);
        errorBatch.length = 0; // Clear the error batch after pushing

        client.release();
    } catch (err) {
        console.error("Error pushing data:", err);
    }
}

async function main() {
    let pool: Pool | null = null;

    if (DB_HOST) {
        pool = new Pool({
            host: DB_HOST,
            port: DB_PORT,
            database: DB_NAME,
            user: DB_USER,
            password: DB_PASSWORD
        });
    }

    await listenEndpoint();

    if (pool) {
        setInterval(async () => {
            await pushData(pool);
        }, 10000); // Push data every 10 seconds
    }
}

main().catch(err => {
    console.error("Error in main function:", err);
});

