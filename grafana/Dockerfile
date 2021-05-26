# Modified from https://github.com/grafana/grafana/blob/master/packaging/docker/custom/Dockerfile

ARG GRAFANA_VERSION="7.5.7"

FROM grafana/grafana:${GRAFANA_VERSION}

USER root

COPY ./provisioning /etc/grafana/provisioning/

RUN chown -R grafana:root /etc/grafana

USER grafana
