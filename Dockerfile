FROM node:current-alpine3.10

WORKDIR /app

COPY package.json .
COPY package-lock.json .

ENV NODE_ENV production
RUN npm i

COPY . .

CMD [ "node", "app.js" ]
