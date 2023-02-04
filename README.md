# Ceramic Stats

> Metrics are gathered from direct instrumentation via OTLP, from AWS custom metrics and Loki/Promtail log analyzers

## Dashboards

  - [Grafana Prod](https://ceramic-stats.3boxlabs.com/)
  - [Grafana Clay](https://ceramic-stats-clay.3boxlabs.com/)
  - [Grafana Dev](https://ceramic-stats-dev.3boxlabs.com/)

## Instrumentation with OTLP 

This pattern will work for any node deployed in the 3box VPC.
_(in the future we may have a libp2p based solution that can work outside our VPC...but not yet)_

![Collector-to-Prometheus Architecture](https://user-images.githubusercontent.com/798887/215293989-7a63a8e9-10e3-4223-bc11-67d13abe0a3f.png)

The Collector architecture was settled on because of the need to support ephemeral workers that cannot be scraped.

### Naming Conventions

Metrics are named according to the pattern `[service]_[mode]_[label]_[?suffix]`.  Some examples:

| Metric Label | Interpretation |
| ----------- | ----------- |
| `cas_server_pin_failed`     | Count of "pin_failed" occurrences in CAS server       |
| `cas_anchor_anchor_success`  | Count of "anchor_success" occurrences in CAS anchor workers        |
| `js_ceramic_stream_pinned_total`  | Count of "stream_pinned" occurrences in Ceramic nodes (on 3box VPC)        |
| `js_ceramic_stream_pinned_total`  | Count of "stream_pinned" occurrences in Ceramic nodes (on 3box VPC)        |
| `agent_model_cum_uniq_sum`  | Running sum of measurements of the "model_cum_uniq" metric, or the number of unique models seen        |
| `agent_model_cum_uniq_count`  | Running count of measurements of the "model_cum_uniq" metric, or the number of unique models seen        |

Simple count metrics may have no suffix, or may have _total suffix.  Histogram metrics will generally have _sum, _count and _bucket suffixes.  For histograms, to have a meaningful value of the metric you will generally divide *_sum/*_count. 

In grafana you may use the PromQL syntax to group, sum, observe rate or increase, or otherwise manipulate the raw metric values to derive meaningful values.  These may be further used to set alerts directly in Grafana. 

You may explore existing metrics directly on the prometheus endpoints

    - [Prometheus Clay](https://ceramic-tnet-grafana-prometheus-1025868463.us-east-2.elb.amazonaws.com/graph)
    - [Prometheus Dev](https://ceramic-dev-grafana-prometheus-1015087063.us-east-2.elb.amazonaws.com/graph)
    - [Prometheus Prod](https://ceramic-prod-grafana-prometheus-356470995.us-east-2.elb.amazonaws.com/graph)

Or examine them from the Sandbox dashboard

<img width="473" alt="image" src="https://user-images.githubusercontent.com/798887/215292683-59f7436a-3c92-4251-9e8d-be6260f9e335.png">

    
### Instrumenting a Project   
    
To add metrics a new project, install the [@ceramicnetwork/observability](https://www.npmjs.com/package/@ceramicnetwork/observability) package ([repo](https://github.com/ceramicnetwork/observability)).  You will specify the service name when you call `start` to start the metrics collection.  Note that the collector host must also be passed as a parameter and must be reachable from your new deployment on the VPC.  Search for COLLECTOR_HOST in the [ceramic-infra](https://github.com/3box/ceramic-infra) repo to see examples of how this is set.

In most cases, however, your project will already have the observability package included, and all you will need to do is to use it.

### Ceramic nodes (js-ceramic)

To add metrics to [js-ceramic](https://github.com/ceramicnetwork/js-ceramic) 3box nodes, simply add the line

`import {ServiceMetrics as Metrics} from '@ceramicnetwork/observability'`

to the file if it is not already present, define your metric names as constants at the top of the file, and add a line such as

`Metrics.count(YOUR_METRIC_LABEL, 1)`

to count occurances of a thing.  After deployment, you can find the corresponding metric in grafana under **js_ceramic_YOUR_METRIC_LABEL**.  If you wish to include additional dimensions, you can freely invent useful dimensions such as return status etc.  These will be available to you for grouping in PromQL when creating a chart in grafana.

`Metrics.count(YOUR_METRIC_LABEL, 1, {'outcome': 'good'}`

Just be careful, that the cardinality of your dimensions is not too high - do not use unique identifiers as dimension values!  Similarly avoid using variables as metric labels, as we do not want a profusion of metrics. 

### CAS

To avoid duplication, please add your CAS metric labels to the [settings](https://github.com/ceramicnetwork/ceramic-anchor-service/blob/develop/src/settings.ts) file in the enum **METRIC_NAMES**

Then in your code, import **METRIC_NAMES** along with observability, and record metrics like so:

`Metrics.count(METRIC_NAMES.SCHEDULER_TASK_UNCAUGHT_ERROR, 1)`

For processes that require simple timing,  you can use the `TimeableMetric` construction.  For more advanced tracing, we should implement the trace capability, which is currently still tbd.

### Viewing your new Metric

_In order to edit the Grafana dashboards, you will need to retrieve the login credentials from 1Password.  If you do not have access to any credentials for "grafana" please ask your manager_

Between PromQL, Grafana transformations and display options, it is possible to achieve customized views, such as the following:

![image](https://user-images.githubusercontent.com/798887/215294186-db28b567-d31a-49af-aa40-a8832a28ecf0.png)![image](https://user-images.githubusercontent.com/798887/215294193-f51f2f4b-b599-4166-b615-7ad48576635d.png)


Each deployment of Grafana has a **Sandbox** area where you can create a new panel to inspect your metrics.  Use 'Prometheus' as the data source and find your metric from the dropdown menu.  

Generally, most count type metrics will use a rate() function to display.  See [PromQL](https://prometheus.io/docs/prometheus/latest/querying/basics/) syntax for how to create queries, or examine the existing panels using the 'Edit' dropdown.  Note due to some javascript flukes in grafana, it is usually necessary to compose your query separately and replace the dashboard query in one go, rather than trying to edit it within the dashboard.  Trying to edit locally often results in an error such as

<img width="330" alt="image" src="https://user-images.githubusercontent.com/798887/215293018-c8937279-14ae-451a-98c2-2bdf38772e52.png">

whereas the same metric pasted all at once, may work fine.

Once you have the panel behaving in the desired way, please add to one of the main Grafana dashboards, or create your own.  When creating a new dashboard it should go into one of the following folders:  Adoption, Performance, Product, or General

<img width="214" alt="image" src="https://user-images.githubusercontent.com/798887/215293089-31e3ed7d-7318-4a50-98bb-8b59d00e66e0.png">

If you would like your new dashboard to be checked into git and propagated from prod -> clay, qa and dev, add it to the appropriate section of https://github.com/3box/ceramic-stats/blob/dev/grafana/src/push-boards.py and run this script with the Grafana API key in your environment. This way we can tweak the dashboards freely using grafana and check them in after being satisfied with the result.  Note that the prometheus driven dashboards are not provisioned (so are not overwritten on deploy).

### Creating an Alert

You may add an alert on any query, using the "Alert" tab.

<img width="914" alt="image" src="https://user-images.githubusercontent.com/798887/215293165-38d78881-3899-493e-94b0-45ea87a471e3.png">

Try to pick a threshold that will not create excessive false positives.  The "No data" handling should be set to "Keep last state" to avoid sending excessive alerts when no data is generated or available for network or other reasons.  (we can have one specific alert about connectivity, but we don't need all the alerts firing).

[List of Production alerts](https://ceramic-stats.3boxlabs.com/alerting/list)
___

## About Loki/Promtail

This package is designed to visualize log-derived data in Grafana. Promtail pulls and labels Ceramic logs then pushes them to Loki, a log aggregation system built for Grafana. Several existing metrics are produced in this way.  New metrics should be added via direct instrumentation if possible.

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


