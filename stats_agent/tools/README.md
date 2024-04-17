
# Rough notes how to determine ceramic version on nodes

### download a copy of the stats agent leveldb

ssh to the bastion host, and mount the volume

prod: `sudo mount -t nfs4 fs-06ac2546cc6113ed7.efs.us-east-2.amazonaws.com:/ /mnt/efs/tmp-stats`
clay: `sudo mount -t nfs4 fs-0d6074e7daff50510.efs.us-east-2.amazonaws.com:/ /mnt/efs/tmp-stats`

then back on your work system:

prod: scp -r -i ~/.ssh/bastion-prod.pem ubuntu@3.139.84.211:/mnt/efs/tmp-stats/ leveldb-prod 
clay: scp -r -i ~/.ssh/bastion-prod.pem ubuntu@18.219.215.231:/mnt/efs/tmp-stats/ tnet-jan-2

### extract the peerids from the leveldb

`python3 ./export-peerids-from-leveldb.py > peerids.txt`

### map them to known clients

`python3 peerids-to-nodes.py`
