FROM node:24-alpine AS builder

WORKDIR /app

COPY back/package*.json ./
RUN npm ci

COPY back/ ./

RUN npm run build
RUN npx prisma generate

## Stage 2 — production image
FROM node:24-alpine

WORKDIR /app

COPY back/package*.json ./
RUN npm ci --omit=dev

# Copy compiled output and prisma files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY back/prisma ./prisma

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/main"]
