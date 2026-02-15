FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY services/order-service/package*.json ./services/order-service/
COPY packages/common/package*.json ./packages/common/
COPY packages/contracts/package*.json ./packages/contracts/
COPY . .
CMD ["npm", "run", "start", "-w", "services/order-service"]
