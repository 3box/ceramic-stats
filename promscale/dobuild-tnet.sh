aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 967314784947.dkr.ecr.us-east-2.amazonaws.com
docker build -t ceramic-tnet-promscale .
docker tag ceramic-tnet-promscale:latest 967314784947.dkr.ecr.us-east-2.amazonaws.com/ceramic-tnet-promscale:tnet
docker push 967314784947.dkr.ecr.us-east-2.amazonaws.com/ceramic-tnet-promscale:tnet
