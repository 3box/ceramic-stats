import leveldb
import boto3
import re

# set
# AWS_ACCESS_KEY_ID
# AWS_SECRET_ACCESS_KEY

# tables: ceramic-dev-grafana-stream [model, did]
ENV = 'tnet'
TMAP = {
    'controller': 'ceramic-{}-grafana-did'.format(ENV),
    'stream': 'ceramic-{}-grafana-stream'.format(ENV),
    'cid': 'ceramic-{}-grafana-stream'.format(ENV),
    'model': 'ceramic-{}-grafana-model'.format(ENV)
}
KMAP = {
    'controller': 'did',
    'cid':'cid',
    'stream': 'cid',
    'streamId': 'cid',
    'model': 'mid'
}
DATA_FILES = {
  'dev': '/Users/gv/bdata/dev-jan-2',
  'tnet': '/Users/gv/bdata/tnet-jan-2',
  'prod': '/Users/gv/bdata/prod-dec-21', # needed to go back > 1 mo
  # 'prod': '/Users/gv/bdata/prod-jan-2'
}

data_file = DATA_FILES[ENV]

db = leveldb.LevelDB(data_file, create_if_missing=False)

cli = boto3.client('dynamodb', region_name='us-east-2')

for key, val in list(db.RangeIter(key_from = None, key_to = None)):
 try:
   # !ttl!controller:0x0508fb22c0154ed77d5a3afd61883137be76eb56@eip155:1
   # !ttl!x!1672711014533!stream:D:kjzl6cwe1jw145ind55apktbhpdj6iu9wwr1o70sxs60b68slxobzlcewkvq7g5
   try:
       (etype, eid) = key.decode().split(':', 1)
   except:
       print("INVALID KEY: " + key)
       continue
   eid = re.sub('^[DM]:','',eid)
   etype = re.sub('^!ttl!','', etype)
   etype = re.sub('^x![0-9]+!','', etype)
   try:
       table = TMAP[etype]
   except:
       print("UNKNOWN TYPE: " + etype)
       continue
   item_key = KMAP[etype]
   print("{}:{}:{}".format(table, item_key,eid))
   cli.put_item(TableName=table, Item={item_key:{'S':eid}})
 except:
   continue 
