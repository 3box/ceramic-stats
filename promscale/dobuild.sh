aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 967314784947.dkr.ecr.us-east-2.amazonaws.com
docker build -t ceramic-dev-grafana-promscale .
docker tag ceramic-dev-grafana-promscale:latest 967314784947.dkr.ecr.us-east-2.amazonaws.com/ceramic-dev-grafana-promscale:dev
docker push 967314784947.dkr.ecr.us-east-2.amazonaws.com/ceramic-dev-grafana-promscale:dev
