FROM grafana/promtail:1.6.0
COPY config.yml /etc/promtail
ENTRYPOINT ["/usr/bin/promtail", "-config.file=/etc/promtail/config.yml"]

