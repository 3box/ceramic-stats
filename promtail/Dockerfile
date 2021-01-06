FROM grafana/promtail:2.0.0
COPY *config.yml /etc/promtail/
RUN mkdir -p /logs/ceramic/gateway
RUN mkdir -p /logs/ceramic/node
RUN mkdir -p /logs/cas/anchor
RUN mkdir -p /logs/cas/server
ENTRYPOINT ["/usr/bin/promtail"]
CMD ["-config.file=/etc/promtail/config.yml"]
