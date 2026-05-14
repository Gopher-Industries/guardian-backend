FROM node:20-bookworm-slim

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV SCARF_ANALYTICS=false

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]