FROM prom/prometheus

ADD prometheus.yml /etc/prometheus/prometheus.yml
ADD startup.sh /startup.sh

USER root

RUN chmod +x /startup.sh

EXPOSE 9090

# the startup script will replace env variables in the prometheus.yml 
# and then run prometheus
ENTRYPOINT ["/startup.sh"]

