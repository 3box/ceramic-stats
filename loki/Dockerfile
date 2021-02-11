FROM grafana/loki:2.1.0 as loki
COPY *config.yaml /etc/loki/
# fake must be included as tenant id for rules path
COPY rules/ /etc/loki/rules/fake/
ENTRYPOINT ["/usr/bin/loki"]
CMD ["-config.file=/etc/loki/config.yaml", "-config.expand-env=true"]
