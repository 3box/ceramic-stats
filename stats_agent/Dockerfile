FROM node:16

RUN wget https://github.com/Yelp/dumb-init/releases/download/v1.2.5/dumb-init_1.2.5_amd64.deb
RUN dpkg -i dumb-init_*.deb

WORKDIR /usr/src/app
COPY package*.json tsconfig*.json ./
RUN npm ci --only-production
COPY . .
RUN npm run build
EXPOSE 9464

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD [ "node", "lib/agent.js" ]
