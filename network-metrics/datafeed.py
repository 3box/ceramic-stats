import aiohttp
import asyncio
import asyncpg
import json

# Database connection parameters
DB_HOST = os.environ.get('DB_HOST')
DB_PORT = '5432'
DB_USER = 'tsuser'
DB_PASSWORD = os.environ.get('DB_PASSWORD')
DB_NAME = 'tsdb'

# Endpoint URL
ENDPOINT_URL = os.environ.get('CERAMIC_URL') + '/api/v0/feed/aggregation/'

# Global variable to store data
data_batch = []
error_batch = []

# Function to listen to the HTTPS endpoint
async def fetch_data(session):
    async with session.get(ENDPOINT_URL, ssl=False) as response:
        if response.status == 200:
            data = await response.json()
            content = json.loads(data['content'])  # Extract and parse the content field
            data_batch.append(content)

            # Process sampleRecentErrors
            for error in content.get('sampleRecentErrors', []):
                error_batch.append({
                    'ts': content['ts'],
                    'ceramic_node_id': content['ceramicNode']['id'],
                    'error': error
                })

            print(f"Fetched data: {content}")
        else:
            print(f"Failed to fetch data: {response.status}")

# Function to push data to PostgreSQL TimescaleDB
async def push_data(pool):
    global data_batch, error_batch
    if not data_batch:
        return
    try:
        async with pool.acquire() as connection:
            insert_query = """
            INSERT INTO network_metrics (ts, ceramic_node_id, ceramic_node_name, peer_id, ip_address, ipfs_version, node_auth_did, ceramic_version, recent_errors, total_indexed_models, total_pinned_streams, max_anchor_request_age_ms, current_pending_requests, mean_anchor_request_age_ms, recent_completed_requests)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            """
            values = [
                (
                    d['ts'],
                    d['ceramicNode']['id'],
                    d['ceramicNode']['name'],
                    d['ceramicNode']['PeerID'],
                    d['ceramicNode']['IPAddress'],
                    d['ceramicNode']['ipfsVersion'],
                    d['ceramicNode']['nodeAuthDID'],
                    d['ceramicNode']['ceramicVersion'],
                    d['recentErrors'],
                    d['totalIndexedModels'],
                    d['totalPinnedStreams'],
                    d['maxAnchorRequestAgeMS'],
                    d['currentPendingRequests'],
                    d['meanAnchorRequestAgeMS'],
                    d['recentCompletedRequests']
                )
                for d in data_batch
            ]
            
            async with connection.transaction():
                await connection.executemany(insert_query, values)
            
            print(f"Pushed {len(data_batch)} records to the database.")
            data_batch = []

            error_insert_query = """
            INSERT INTO network_errors (ts, ceramic_node_id, error)
            VALUES ($1, $2, $3)
            """
            error_values = [
                (
                    e['ts'],
                    e['ceramic_node_id'],
                    e['error']
                )
                for e in error_batch
            ]
            
            async with connection.transaction():
                await connection.executemany(error_insert_query, error_values)
            
            print(f"Pushed {len(error_batch)} error records to the database.")
            error_batch = []
    except Exception as e:
        print(f"Error pushing data: {e}")

# Main function to run the event loop
async def main():
    pool = await asyncpg.create_pool(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    
    async with aiohttp.ClientSession() as session:
        while True:
            await fetch_data(session)
            await asyncio.sleep(1)  # Sleep for 1 second between fetches

async def batch_push():
    pool = await asyncpg.create_pool(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    
    while True:
        await push_data(pool)
        await asyncio.sleep(10)  # Sleep for 10 seconds between pushes

if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    tasks = [
        loop.create_task(main()),
        loop.create_task(batch_push())
    ]
    loop.run_until_complete(asyncio.wait(tasks))

