FROM node:14
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only-production
COPY . .
CMD [ "node", "src/agent.js" ]
