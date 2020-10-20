FROM grafana/loki:1.6.0 as loki
COPY local-config.yaml /etc/loki
ENTRYPOINT [ "/usr/bin/loki" ]
CMD ["-config.file=/etc/loki/local-config.yaml", "-log-config-reverse-order" ]
