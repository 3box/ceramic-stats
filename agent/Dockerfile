FROM node:12
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci --only-production

FROM node:12-slim
WORKDIR /usr/src/app
COPY . .
CMD [ "node", "src/index.js" ]
