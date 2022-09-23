FROM prom/prometheus

ADD prometheus.yml /etc/prometheus/prometheus.yml
ADD prometheus.yml /prometheus/prometheus.yml


ADD interpolate.sh /etc/prometheus/interpolate.sh

USER root

EXPOSE 9090

CMD [ "--web.enable-admin-api" ]
