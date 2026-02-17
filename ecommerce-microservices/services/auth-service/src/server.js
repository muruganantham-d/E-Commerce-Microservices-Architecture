const mongoose = require("mongoose");
const { Kafka } = require("kafkajs");
const { createApp } = require("./app");
const env = require("./config/env");
const { createAuthEventPublisher } = require("./events/publisher");

async function start() {
  await mongoose.connect(env.mongoUri);
  console.log(`[auth-service] Connected MongoDB ${env.mongoUri}`);

  const kafka = new Kafka({
    clientId: `${env.serviceName}-producer`,
    brokers: env.kafkaBrokers
  });

  const kafkaProducer = kafka.producer();
  await kafkaProducer.connect();
  console.log(`[auth-service] Connected Kafka brokers=${env.kafkaBrokers.join(",")}`);

  const authEventPublisher = createAuthEventPublisher(kafkaProducer);
  const app = createApp({ authEventPublisher });

  const server = app.listen(env.httpPort, "0.0.0.0", () => {
    console.log(`[auth-service] HTTP listening on ${env.httpPort}`);
  });

  const shutdown = async () => {
    console.log("[auth-service] Shutting down");
    server.close();
    await kafkaProducer.disconnect();
    await mongoose.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("[auth-service] Startup failed", error);
  process.exit(1);
});
