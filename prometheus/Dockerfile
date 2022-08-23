FROM prom/prometheus

ADD prometheus.yml /etc/prometheus/prometheus.yml
ADD interpolate.sh /etc/prometheus/interpolate.sh

USER root

EXPOSE 9090
