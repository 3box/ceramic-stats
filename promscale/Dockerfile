FROM timescale/promscale:latest

ADD promscale.yml /promscale.yml
EXPOSE 9201

CMD ["./promscale", "--log.level=debug", "--log.format=clilog"]
