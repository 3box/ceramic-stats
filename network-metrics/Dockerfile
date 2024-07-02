# Use an official Node runtime as a parent image
FROM node:14

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Install TypeScript globally
RUN npm install -g typescript

# Compile TypeScript to JavaScript
RUN tsc

# Set the environment variable to production
ENV NODE_ENV=production

# Expose the port the app runs on
EXPOSE 3000

# Command to run the app
CMD [ "node", "dist/feed.js" ]

