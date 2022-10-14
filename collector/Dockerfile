#FROM otel/opentelemetry-collector:0.60.0
FROM jaegertracing/all-in-one:latest

ADD config.yaml /etc/otelcol/config.yaml

EXPOSE 1888
EXPOSE 8888
EXPOSE 8889
EXPOSE 13133
EXPOSE 4317
EXPOSE 4318
EXPOSE 55679

# see https://opentelemetry.io/docs/collector/getting-started/
