import leveldb
import boto3
import re

# set
# AWS_ACCESS_KEY_ID
# AWS_SECRET_ACCESS_KEY

# tables: ceramic-dev-grafana-stream [model, did]
ENV = 'dev'
TMAP = {
    'controller': 'ceramic-{}-grafana-did'.format(ENV),
    'stream': 'ceramic-{}-grafana-stream'.format(ENV),
    'model': 'ceramic-{}-grafana-model'.format(ENV)
}
KMAP = {
    'controller': 'did',
    'stream': 'cid',
    'model': 'mid'
}

db = leveldb.LevelDB('/Users/gv/bdata/tmp-stats', create_if_missing=False)

cli = boto3.client('dynamodb', region_name='us-east-2')

for key, val in list(db.RangeIter(key_from = None, key_to = None)):
   print(key)
   print(val)

   # !ttl!controller:0x0508fb22c0154ed77d5a3afd61883137be76eb56@eip155:1
   (etype, eid) = key.decode().split(':', 1)
   etype = re.sub('!ttl!','', etype)

   table = TMAP[etype]
   item_key = KMAP[etype]
   cli.put_item(TableName=table, Item={item_key:{'S':eid}})
      
   import pdb; pdb.set_trace()
