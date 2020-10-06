# Ceramic Stats

> A Loki/Promtail configuration to collect Ceramic network stats

## About

This package is designed to visualize data in Grafana. Promtail pulls and labels Ceramic logs then pushes them to Loki, a log aggregation system built for Grafana.

## Installation

Each component in this package runs in a Docker container (but can also be run natively on your system by downloading the binaries).

### Install and run Ceramic
- [js-ceramic](https://github.com/ceramicnetwork/js-ceramic)

### Pull the docker images

- [grafana/grafana](https://grafana.com/docs/grafana/latest/installation/docker/)
- [grafana/loki](https://grafana.com/docs/loki/latest/installation/docker/)
- [grafana/promtail](https://grafana.com/docs/loki/latest/clients/promtail/installation/)

## Quick Setup (Recommended)

```
docker-compose up --abort-on-container-exit
```

> If you'd like to run the containers in the background, note that you must check for startup failures yourself
> ```
> docker-compose up -d
> ```

## Advanced Setup
without Docker compose

### Run Loki

```
docker run -v $(pwd):/mnt/config -p 3100:3100 grafana/loki:1.6.0 -config.file=/mnt/config/loki-config.yaml
```

Check its status `http://localhost:3100/ready` and start Promtail when it's ready

### Run Promtail

> Note: If you are not using mac os you should update the client url in `promtail-config.yaml` from docker.for.mac or you must connect your Docker containers to the same network.

The command below attaches volumes to pull the config file and logs. It assumes your Ceramic logs are stored at `usr/local/var/log/ceramic/`.

```
docker run -v $(pwd):/mnt/config -v /usr/local/var/log:/var/log grafana/promtail:1.6.0 -config.file=/mnt/config/promtail-config.yaml -log.level debug
```

### Run Grafana

```
docker run -p 3000:3000 grafana/grafana`
```

> (Optional)
> Create a persistent volume for your data in /var/lib/grafana and run with the volume attached
>
> `docker volume create grafana-storage`
>
> `docker run -p 3000:3000 -v grafana-storage:/var/lib/grafana grafana/grafana`

Login to `http://localhost:3000` with u: admin p: admin


## Usage

Now that the services are running you can

1. Add Loki as a data source with url `http://loki:3100` (or http://docker.for.mac.localhost:3100 for advanced setup)

2. Click the `+` button on the left of the Grafana page and click "import"

3. Paste the contents of `dashboard.json` into the field

## Development

#### In Progress

- Persistent object storage for compressed Loki chunks (S3 or file system locally)
- Persistent index storage for labeled logs (DynamoDB or boltdb locally)
- Setup Grafana provisioning with config files 

## Contributing
We are happy to accept small and large contributions. Make sure to check out the [Ceramic specifications](https://github.com/ceramicnetwork/specs) for details of how the protocol works.

## License

Apache 2.0

