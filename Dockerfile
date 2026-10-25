# Use a specific version of the Node.js runtime as the base image
FROM node:20-alpine
RUN apk add --no-cache chromium

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV MONGOMS_DISABLE_POSTINSTALL=1

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]