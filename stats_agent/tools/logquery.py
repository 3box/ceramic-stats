from time import (time, sleep)
import os
"""
aws logs start-query --region us-east-2 --log-group-names "/ecs/ceramic-prod-cas" "/ecs/ceramic-prod-grafana" "/ecs/ceramic-prod-private" "/ecs/ceramic-prod-public" --start-time 1669091857 --end-time 1669102657 --limit 10000 --query-string "fields @message | filter @message like /ERROR/"
"""

limit = 10000
log_group_names = '" "'.join(["/ecs/ceramic-prod-cas","/ecs/ceramic-prod-grafana","/ecs/ceramic-prod-private","/ecs/ceramic-prod-public"])

epoch_now = int(time())

epoch_start = epoch_now - 86400 * 45

qwindow = 3 * 60 * 60

query = "fields @timestamp, @message | filter @message like /streamid/"

# rate approx 1000/hr
# get 3 hr increments to be on safe side

qstart = epoch_start
while qstart < epoch_now:
   end_time = str(qstart + qwindow)
   start_time = str(qstart)

   cmd = "aws logs start-query --region us-east-2 --log-group-names \"{}\" --start-time {} --end-time {} --limit {} --query-string \"{}\" | grep 'queryId' >> queries.txt".format(log_group_names, start_time, end_time, limit, query)
   os.system(cmd) 

   sleep(10)
   qstart += qwindow
