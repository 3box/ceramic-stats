aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 967314784947.dkr.ecr.us-east-2.amazonaws.com
docker build -t ceramic-qa-timescaledb .
docker tag ceramic-qa-timescaledb:latest 967314784947.dkr.ecr.us-east-2.amazonaws.com/ceramic-qa-timescaledb:qa
docker push 967314784947.dkr.ecr.us-east-2.amazonaws.com/ceramic-qa-timescaledb:qa
