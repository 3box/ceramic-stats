FROM grafana/loki:2.0.0 as loki
COPY config.yaml /etc/loki
ENTRYPOINT ["/usr/bin/loki"]
CMD ["-config.file=/etc/loki/config.yaml"]
