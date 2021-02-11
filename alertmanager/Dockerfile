FROM prom/alertmanager
COPY *config.yaml /etc/alertmanager/
ENTRYPOINT [ "/bin/alertmanager" ]
CMD [ "--config.file=/etc/alertmanager/config.yaml" ]
