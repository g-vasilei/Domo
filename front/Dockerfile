## Stage 1 — build
FROM node:24-alpine AS builder

WORKDIR /app

COPY front/package*.json ./
RUN npm ci

COPY front/ ./

RUN npm run build

## Stage 2 — serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY front/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
