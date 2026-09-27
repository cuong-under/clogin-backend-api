FROM node:20-alpine
WORKDIR /app
# NODE_ENV=production là BẮT BUỘC: thiếu nó, utils/env.js isDev() coi môi
# trường lạ là dev và (trước khi vá) cho phép secret fallback hardcode.
ENV NODE_ENV=production
RUN apk add --no-cache openssl wget
COPY package*.json ./
RUN npm ci --production
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
# Không chạy root: container escape có blast radius nhỏ hơn.
RUN chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "src/index.js"]
