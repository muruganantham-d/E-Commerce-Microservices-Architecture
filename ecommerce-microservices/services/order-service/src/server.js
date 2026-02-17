const mongoose = require("mongoose");
const { Kafka } = require("kafkajs");
const { createClient } = require("redis");
const env = require("./config/env");
const { createApp } = require("./app");
const { createOrderEventPublisher } = require("./events/publisher");
const { createProductGrpcClient } = require("./grpc/product.client");

async function start() {
  await mongoose.connect(env.mongoUri);
  console.log(`[order-service] Connected MongoDB ${env.mongoUri}`);

  const redisClient = createClient({ url: env.redisUrl });
  await redisClient.connect();
  console.log(`[order-service] Connected Redis ${env.redisUrl}`);

  const kafka = new Kafka({
    clientId: `${env.serviceName}-producer`,
    brokers: env.kafkaBrokers
  });

  const kafkaProducer = kafka.producer();
  await kafkaProducer.connect();
  console.log(`[order-service] Connected Kafka brokers=${env.kafkaBrokers.join(",")}`);

  const orderEventPublisher = createOrderEventPublisher(kafkaProducer);
  const productGrpcClient = createProductGrpcClient(env.productGrpcUrl);
  console.log(`[order-service] Connected gRPC ProductService ${env.productGrpcUrl}`);

  const app = createApp({
    redisClient,
    productGrpcClient,
    orderEventPublisher,
    orderIdempotencyTtlSeconds: env.orderIdempotencyTtlSeconds
  });

  const server = app.listen(env.httpPort, "0.0.0.0", () => {
    console.log(`[order-service] HTTP listening on ${env.httpPort}`);
  });

  const shutdown = async () => {
    console.log("[order-service] Shutting down");
    server.close();
    await kafkaProducer.disconnect();
    await redisClient.disconnect();
    await mongoose.disconnect();
    productGrpcClient.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("[order-service] Startup failed", error);
  process.exit(1);
});
