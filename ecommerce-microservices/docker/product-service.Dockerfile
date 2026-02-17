FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY services/product-service/package*.json ./services/product-service/
COPY packages/common/package*.json ./packages/common/
COPY packages/contracts/package*.json ./packages/contracts/
COPY . .
RUN npm install --omit=dev
CMD ["npm", "run", "start", "-w", "services/product-service"]