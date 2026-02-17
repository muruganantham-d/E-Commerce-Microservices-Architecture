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
  serviceName: process.env.SERVICE_NAME || "auth-service",
  httpPort: Number(process.env.HTTP_PORT || 3001),
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/auth_db",
  kafkaBrokers: parseKafkaBrokers(process.env.KAFKA_BROKERS)
};
