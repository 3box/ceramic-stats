FROM node:16

RUN wget https://github.com/Yelp/dumb-init/releases/download/v1.2.5/dumb-init_1.2.5_amd64.deb
RUN dpkg -i dumb-init_*.deb

WORKDIR /usr/src/app
COPY package*.json tsconfig*.json ./
RUN npm ci --only-production
COPY . .
RUN npm run build
EXPOSE 9464

# set the runtime ENV vars from the build ARGs
ARG AWS_ACCESS_KEY_ID=default-key
ARG AWS_SECRET_ACCESS_KEY=default-secret-key
ARG ENV=default-env
ENV AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
ENV AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
ENV ENV=$ENV

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD [ "node", "lib/agent.js" ]
