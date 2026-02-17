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
  serviceName: process.env.SERVICE_NAME || "order-service",
  httpPort: Number(process.env.HTTP_PORT || 3003),
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27019/order_db",
  kafkaBrokers: parseKafkaBrokers(process.env.KAFKA_BROKERS),
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  productGrpcUrl:
    process.env.PRODUCT_GRPC_ADDR || process.env.PRODUCT_GRPC_URL || "localhost:50051",
  orderIdempotencyTtlSeconds: Number(process.env.ORDER_IDEMPOTENCY_TTL_SECONDS || 300)
};
