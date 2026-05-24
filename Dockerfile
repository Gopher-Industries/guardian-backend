FROM node:20-bookworm-slim
# Use a specific version of the Node.js runtime as the base image
FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV SCARF_ANALYTICS=false

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]