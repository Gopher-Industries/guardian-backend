# Use a specific version of the Node.js runtime as the base image
FROM node:20-alpine
RUN apk add --no-cache chromium

RUN apk add --no-cache chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install the dependencies specified in package.json
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .


EXPOSE 3000

CMD ["node", "src/server.js"]