#!/bin/bash

#  "queryId": "10fdd16c-2038-4184-bdbb-d88a660b737c"
for x in `cat queries.txt queries1.txt | perl -n -e '/queryId": "([^"]+)"/ && print "$1\n"'`
do
   echo $x
   aws logs get-query-results --query-id $x | perl -n -e '/ts=(\S{10}).*streamid=(\S+)/ && print "$2,$1\n"' | sort | uniq >> streams.txt
done
