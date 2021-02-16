FROM prom/alertmanager
COPY *config.yaml /etc/alertmanager/
ENTRYPOINT [ "/bin/alertmanager" ]
CMD [ "--config.file=/etc/alertmanager/local-config.yaml", "--cluster.listen-address=\"\"", "--log.level=debug" ]
