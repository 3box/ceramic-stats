# Ceramic Stats

> A Loki/Promtail configuration to collect Ceramic network stats

> Also Newer configuration OTLP Collectors & Exporters & Prometheus

## Dashboards

  - [Grafana Prod](https://ceramic-stats.3boxlabs.com/)
  - [Grafana Clay](https://ceramic-stats-clay.3boxlabs.com/)
  - [Grafana Dev](https://ceramic-stats-dev.3boxlabs.com/)


## About OTLP/Collectors/Prometheus

To experiment with stats directly on the prometheus endpoints:
    - [Prometheus Clay](http://ceramic-tnet-grafana-prometheus-1025868463.us-east-2.elb.amazonaws.com/graph)
    - [Prometheus Dev](ceramic-dev-grafana-prometheus-1015087063.us-east-2.elb.amazonaws.com/graph)
    - [Prometheus Prod](ceramic-prod-grafana-prometheus-356470995.us-east-2.elb.amazonaws.com/graph)
    
To add metrics to Ceramic nodes, use `Metrics.count(YOUR_METRIC_NAME, 1)` by importing the [@ceramicnetwork/metrics](https://socket.dev/npm/package/@ceramicnetwork/metrics) package

To add metrics to CAS Anchor workers, use the same pattern using the `ServiceMetrics` utility

Feel free to add metrics!  Just be careful that if you include parameters, that the cardinality is not too high.

![image](https://user-images.githubusercontent.com/798887/191905588-77959f5f-32b4-473c-a17c-aa2fab2ca911.png)

## About Loki/Promtail

This package is designed to visualize data in Grafana. Promtail pulls and labels Ceramic logs then pushes them to Loki, a log aggregation system built for Grafana.

![diagram](diagram.png?raw=true "Diagram")

## Installation

Each component in this package runs in a Docker container (but can also be run natively on your system by downloading the binaries).

### Install and run Ceramic (and optionally Ceramic Anchor Service)
- [js-ceramic](https://github.com/ceramicnetwork/js-ceramic)
- [ceramic-anchor-service](https://github.com/ceramicnetwork/ceramic-anchor-service)

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

## Manual Setup
without Docker compose

> You can build the images in this repo or run the images provided by the Grafana team for their default configuration.

### Run Loki

```
docker run \
-v $(pwd):/mnt/config \
-p 3100:3100 \
grafana/loki:2.0.0 \
-config.file=/mnt/config/loki-config.yaml
```

Check its status `http://localhost:3100/ready` and start Promtail when it's ready

### Run Promtail

The command below attaches volumes to pull the config file and logs. It assumes your Ceramic logs are stored in this directory at `./ceramic` and `./cas`. The easiest way to get logs here is to symlink them:

```
ln -s ~/path/to/js-ceramic/packages/cli/logs ./ceramic
ln -s ~/path/to/ceramic-anchor-service/logs ./cas
```

Then run the image

```
docker run \
-v $(pwd):/mnt/config \
-v $(pwd)/ceramic:/var/log/ceramic \
-v $(pwd)/cas:/var/log/cas \
grafana/promtail:2.0.0 \
-config.file=/mnt/config/promtail-config.yaml \
-log.level debug
```

### Run Grafana

```
docker run -p 3000:3000 grafana/grafana
```

## Usage

Now that the services are running you can, login to Grafana at `http://localhost:3000` with u: admin p: admin

## Contributing
We are happy to accept small and large contributions. Make sure to check out the [Ceramic specifications](https://github.com/ceramicnetwork/specs) for details of how the protocol works.

## Troubleshooting

If a workflow step fails on push, force a retry by making a trivial change (like to this README)

## License

Apache 2.0


