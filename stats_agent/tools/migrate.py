import plyvel
import boto3

# set
# AWS_ACCESS_KEY_ID
# AWS_SECRET_ACCESS_KEY

# tables: ceramic-dev-grafana-stream [model, did]

db = plyvel.DB('/db/tmp_db/', create_if_missing=False)

cli = boto3.client('dynamodb')

for key, val in db:
   print(key)
   print(value)

   import pdb; pdb.set_trace()
