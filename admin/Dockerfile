FROM node:20-alpine AS builder
WORKDIR /app
COPY admin/package*.json ./
RUN npm install
COPY admin/ .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache wget
ENV NODE_ENV=production
COPY --from=builder /app/admin/.next/standalone ./
COPY --from=builder /app/admin/.next/static ./.next/static
COPY --from=builder /app/admin/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
