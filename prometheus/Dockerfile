FROM prom/prometheus

ADD prometheus.yml /etc/prometheus/prometheus.yml

USER root

EXPOSE 9090

CMD [ "--web.enable-admin-api", \
      "--config.file=/etc/prometheus/prometheus.yml", \
      "--storage.tsdb.path=/prometheus", \
      "--web.console.libraries=/usr/share/prometheus/console_libraries", \
      "--web.console.templates=/usr/share/prometheus/consoles" ] 
