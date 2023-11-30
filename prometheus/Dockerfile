FROM prom/prometheus

ADD prometheus.yml /etc/prometheus/prometheus.yml
ADD startup.sh /etc/prometheus/startup.sh

USER root

RUN chmod +x /etc/prometheus/startup.sh

EXPOSE 9090

# the startup script will replace env variables in the prometheus.yml 
# and then run prometheus
ENTRYPOINT ["/etc/prometheus/startup.sh"]

