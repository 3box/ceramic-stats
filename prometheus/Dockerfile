FROM prom/prometheus

ADD prometheus.yml /etc/prometheus/prometheus.yml
ADD interpolate.sh /etc/prometheus/interpolate.sh

RUN /etc/prometheus/interpolate.sh

EXPOSE 9090
