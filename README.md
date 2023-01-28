# Ceramic Stats

> Metrics are gathered from direct instrumentation via OTLP, AWS custom metrics and Loki/Promtail log analyzers

## Dashboards

  - [Grafana Prod](https://ceramic-stats.3boxlabs.com/)
  - [Grafana Clay](https://ceramic-stats-clay.3boxlabs.com/)
  - [Grafana Dev](https://ceramic-stats-dev.3boxlabs.com/)

## Instrumentation with OTLP 

This pattern will work for any node deployed in the 3box VPC, as it sends data to the Collector.
_(in the future we may have a libp2p based solution that can work outside our VPC...but not yet)_

![Collector-to-Prometheus Architecture](https://user-images.githubusercontent.com/798887/215292054-8ed7a8df-c381-4fbc-87fd-48e73bf0c260.png)

### Naming Conventions

Metrics are named according to the pattern `[service]_[mode]_[label]_[?suffix]`

For example, `cas_server_pin_failed` is a count of `pin_failed` occurances in CAS Server

`cas_anchor_anchor_success` is a count of `anchor_success` occurences in CAS anchor workers

`js_ceramic_stream_pinned_total` is a count of `stream_pinned` occurences in Ceramic nodes (on 3box VPC)

Simple count metrics may have no suffix, or may have _total suffix.  Histogram metrics will generally have _sum, _count and _bucket suffixes.

`agent_model_cum_uniq_sum` is a running sum of measurements of the `model_cum_uniq` count from stats agent.  It should be divided by `agent_model_cum_uniq_count` in order to have a meaningful value, which is the running observed number of unique models counted in dynamodb.

You may explore existing metrics directly on the prometheus endpoints:

    - [Prometheus Clay](ceramic-tnet-grafana-prometheus-1025868463.us-east-2.elb.amazonaws.com/graph)
    - [Prometheus Dev](ceramic-dev-grafana-prometheus-1015087063.us-east-2.elb.amazonaws.com/graph)
    - [Prometheus Prod](ceramic-prod-grafana-prometheus-356470995.us-east-2.elb.amazonaws.com/graph)

Or examine them from the Sandbox dashboard
    
### Instrumenting a Project   
    
To add metrics a new project, install the [@ceramicnetwork/observability](https://www.npmjs.com/package/@ceramicnetwork/observability) package.  You will specify the service name when you call `start` to start the metrics collection.  Note that the collector host must also be passed as a parameter and must be reachable from your new deployment on the VPC.  Search for COLLECTOR_HOST in the [ceramic-infra](https://github.com/3box/ceramic-infra) repo to see examples of how this is set.

In most cases, however, your project will already have the observability package included, and all you will need to do is to use it.

### Ceramic nodes (js-ceramic)

To add metrics to [js-ceramic](https://github.com/ceramicnetwork/js-ceramic) 3box nodes, simply add the line

`import {ServiceMetrics as Metrics} from '@ceramicnetwork/observability'`

to the file if it is not already present, define your metric names as constants at the top of the file, and add a line such as

`Metrics.count(YOUR_METRIC_LABEL, 1)`

to count occurances of a thing.  After deployment, you can find the corresponding metric in grafana under `js_ceramic_YOUR_METRIC_LABEL`.  If you wish to include additional dimensions, you can freely invent useful dimensions such as return status etc.  These will be available to you for grouping in PromQL when creating a chart in grafana.

`Metrics.count(YOUR_METRIC_LABEL, 1, {'outcome': 'good'}`

Just be careful, that the cardinality of your dimensions is not too high - do not use unique identifiers as dimension values!  Similarly avoid using variables as metric labels, as we do not want a profusion of metrics. 

### CAS

To avoid duplication, please add your CAS metric labels to the [settings](https://github.com/ceramicnetwork/ceramic-anchor-service/blob/develop/src/settings.ts) file in the enum **METRIC_NAMES**

Then in your code, import METRIC_NAMES along with observability, and record metrics like so:

`Metrics.count(METRIC_NAMES.SCHEDULER_TASK_UNCAUGHT_ERROR, 1)`

For processes that require simple timing,  you can use the `TimeableMetric` construction.  For more advanced tracing, we should implement the trace capability, which is currently still tbd.


## About Loki/Promtail

This package is designed to visualize log-derived data in Grafana. Promtail pulls and labels Ceramic logs then pushes them to Loki, a log aggregation system built for Grafana.

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


