FROM python:3.9-slim

WORKDIR /usr/src/app
COPY requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt
COPY datafeed.py ./

ENV DB_HOST=$DB_HOST
ENV DB_PASSWORD=$DB_PASSWORD
ENV CERAMIC_URL=$CERAMIC_URL
ENV ENV=$ENV

CMD [ "python", "datafeed.py" ]
