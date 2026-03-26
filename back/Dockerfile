## Stage 1 — build
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY back/package.json ./back/
RUN npm ci

COPY back/ ./back/
COPY tsconfig.base.json ./

WORKDIR /app/back
RUN npx prisma generate
RUN npm run build

## Stage 2 — production image
FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
COPY back/package.json ./back/
RUN npm ci --omit=dev

COPY --from=builder /app/back/dist ./back/dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY back/prisma ./back/prisma

ENV NODE_ENV=production
EXPOSE 3000

WORKDIR /app/back
CMD ["node", "dist/main"]
