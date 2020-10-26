# Modified from https://github.com/grafana/grafana/blob/master/packaging/docker/custom/Dockerfile

ARG GRAFANA_VERSION="latest"

FROM grafana/grafana:${GRAFANA_VERSION}

USER root

COPY ./provisioning /etc/grafana/provisioning/

RUN chown -R grafana:grafana /etc/grafana

ENV GF_AUTH_ANONYMOUS_ENABLED="true"
ENV GF_AUTH_ANONYMOUS_ORG_NAME="Public"
ENV GF_AUTH_ANONYMOUS_ORG_ROLE="Viewer"

USER grafana
