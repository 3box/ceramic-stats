FROM grafana/promtail:2.0.0
COPY *config.yml /etc/promtail/
ENTRYPOINT ["/usr/bin/promtail"]
CMD ["-config.file=/etc/promtail/config.yml"]
