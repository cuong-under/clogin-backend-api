FROM node:18-alpine
WORKDIR /app
RUN mkdir -p /app/data
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
