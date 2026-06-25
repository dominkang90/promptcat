FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 10000
CMD ["npx", "tsx", "src/gallery-server.ts"]
