## Stage 1 — build
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY front/package.json ./front/
RUN npm ci

COPY front/ ./front/
COPY tsconfig.base.json ./

WORKDIR /app/front
RUN npm run build

## Stage 2 — serve with nginx
FROM nginx:alpine

COPY --from=builder /app/front/dist /usr/share/nginx/html
COPY front/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
