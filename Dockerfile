# Dockerfile cho ứng dụng Thiệp Cưới (Node.js Web Server)
FROM node:20-alpine

WORKDIR /app

# Tận dụng cache cài đặt thư viện
COPY package*.json ./
RUN npm ci --only=production

# Copy toàn bộ mã nguồn
COPY . .

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
