FROM node:16
WORKDIR /usr/src/app
COPY package*.json tsconfig*.json ./
RUN npm ci --only-production
COPY . .
RUN npm run build
EXPOSE 9464
EXPOSE 9090
CMD [ "node", "lib/agent.js" ]
