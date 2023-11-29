#!/bin/bash

# Update the Prometheus configuration file
perl -pi -e "s/CAS_METRICS_HOST/$CAS_METRICS_HOST/g" /etc/prometheus/prometheus.yml
perl -pi -e "s/CERAMIC_METRICS_HOST/$CERAMIC_METRICS_HOST/g" /etc/prometheus/prometheus.yml

# Start Prometheus with the updated configuration
/prometheus --web.enable-admin-api \
            --config.file=/etc/prometheus/prometheus.yml \
            --storage.tsdb.path=/prometheus \
            --storage.tsdb.retention.time=720d \
            --web.console.libraries=/usr/share/prometheus/console_libraries \
            --web.console.templates=/usr/share/prometheus/consoles

