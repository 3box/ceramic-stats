#!/bin/sh

sed -i -e "s/%%CERAMIC_TARGET%%/$CERAMIC_METRICS_HOST:$METRICS_EXPORTER_PORT/" /etc/prometheus/prometheus.yml
sed -i -e "s/%%CAS_TARGET%%/$CAS_METRICS_HOST:$METRICS_EXPORTER_PORT/" /etc/prometheus/prometheus.yml

