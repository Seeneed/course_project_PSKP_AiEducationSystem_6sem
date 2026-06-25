FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker/nginx/docker-entrypoint.sh /docker-entrypoint.d/40-generate-selfsigned.sh
COPY --from=build /app/dist /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.d/40-generate-selfsigned.sh

EXPOSE 80 443
