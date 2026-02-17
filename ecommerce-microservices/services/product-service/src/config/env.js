const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function parseKafkaBrokers(value) {
  return (value || "localhost:9092")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

module.exports = {
  serviceName: process.env.SERVICE_NAME || "product-service",
  httpPort: Number(process.env.HTTP_PORT || 3002),
  grpcPort: Number(process.env.GRPC_PORT || 50051),
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27018/product_db",
  kafkaBrokers: parseKafkaBrokers(process.env.KAFKA_BROKERS),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  orderCreatedConsumerGroup:
    process.env.ORDER_CREATED_CONSUMER_GROUP || "product-service-order-created-v1"
};
