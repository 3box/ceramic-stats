import boto3
import re
import sys

cli = boto3.client('dynamodb', region_name='us-east-2')

buckets = {}
uniqs = {}
print("Starting...")

for line in sys.stdin:
    try:
        (table, item_key, eid) =  line.split(',')
    except:
        print("BAD LINE: " + line)
        continue 
    if table not in buckets:
        buckets[table] = []
        uniqs[table] = set()
    if eid in uniqs[table]:
        continue
    
    buckets[table].append( { 'PutRequest': {'Item':{item_key:{'S':eid}}}})
    uniqs[table].add(eid)
    if len(buckets[table]) >= 25:
        try:
          cli.batch_write_item( RequestItems={ table: buckets[table]})
          buckets[table] = []
          uniqs[table] = set()
          print('.', end='')
        except Exception as e:
          print("ERROR writing to table {} : {}".format(table, str(e)))

for table in buckets:
    if buckets[table]:
        print("Doing final batch write for " + table)
        cli.batch_write_item( RequestItems={ table: buckets[table]})
print("Done.")
