FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl wget
COPY api/package*.json ./
RUN npm ci --production
COPY api/prisma ./prisma
RUN npx prisma generate
COPY api/src ./src
EXPOSE 3000
CMD ["node", "src/index.js"]
