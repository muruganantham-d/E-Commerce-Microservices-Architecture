const mongoose = require("mongoose");
const { Kafka } = require("kafkajs");
const { createClient } = require("redis");
const { createApp } = require("./app");
const env = require("./config/env");
const Product = require("./data/models/product.model");
const { createProductEventPublisher } = require("./events/publisher");
const { startOrderCreatedConsumer } = require("./events/order-created.consumer");
const { startProductGrpcServer } = require("./grpc/product.grpc");

async function reserveStockForOrder(request, { productEventPublisher }) {
  const { orderId, items } = request || {};
  const normalizedItems = Array.isArray(items) ? items : [];

  if (!orderId) {
    return { success: false, message: "orderId is required", reservedItems: [] };
  }

  if (normalizedItems.length === 0) {
    return { success: false, message: "items are required", reservedItems: [] };
  }

  const reservedForRollback = [];
  const reservedItems = [];

  for (const item of normalizedItems) {
    const quantity = Number(item.quantity || 0);
    if (!item.productId || quantity <= 0) {
      await rollbackReservations(orderId, reservedForRollback);
      return {
        success: false,
        message: "each item must include productId and positive quantity",
        reservedItems: []
      };
    }

    const existing = await Product.findOne({
      productId: item.productId,
      "reservations.orderId": orderId
    });

    if (existing) {
      reservedItems.push({
        productId: item.productId,
        quantity,
        remainingStock: existing.inventory
      });
      continue;
    }

    const updated = await Product.findOneAndUpdate(
      {
        productId: item.productId,
        isActive: true,
        inventory: { $gte: quantity }
      },
      {
        $inc: { inventory: -quantity },
        $push: {
          reservations: {
            orderId,
            quantity,
            status: "reserved",
            reservedAt: new Date()
          }
        }
      },
      { new: true }
    );

    if (!updated) {
      await rollbackReservations(orderId, reservedForRollback);
      return {
        success: false,
        message: `insufficient stock for productId=${item.productId}`,
        reservedItems: []
      };
    }

    reservedForRollback.push({ productId: item.productId, quantity });
    const previousQty = updated.inventory + quantity;
    reservedItems.push({
      productId: item.productId,
      quantity,
      remainingStock: updated.inventory
    });

    await productEventPublisher.publishInventoryUpdated({
      productId: item.productId,
      warehouseId: "default",
      delta: -quantity,
      previousQty,
      newQty: updated.inventory,
      reason: "grpc_reserve_stock",
      updatedAt: new Date().toISOString()
    });
  }

  console.log(
    `[product-service] Reserved stock for orderId=${orderId} items=${reservedItems.length}`
  );

  return {
    success: true,
    message: "stock reserved",
    reservedItems
  };
}

async function rollbackReservations(orderId, rollbacks) {
  for (const rollback of rollbacks) {
    await Product.findOneAndUpdate(
      { productId: rollback.productId, "reservations.orderId": orderId },
      {
        $inc: { inventory: rollback.quantity },
        $pull: { reservations: { orderId } }
      }
    );
  }
}

async function start() {
  await mongoose.connect(env.mongoUri);
  console.log(`[product-service] Connected MongoDB ${env.mongoUri}`);

  const redisClient = createClient({ url: env.redisUrl });
  await redisClient.connect();
  console.log(`[product-service] Connected Redis ${env.redisUrl}`);

  const kafka = new Kafka({
    clientId: `${env.serviceName}-runtime`,
    brokers: env.kafkaBrokers
  });

  const kafkaProducer = kafka.producer();
  await kafkaProducer.connect();
  console.log(`[product-service] Connected Kafka brokers=${env.kafkaBrokers.join(",")}`);

  const productEventPublisher = createProductEventPublisher(kafkaProducer);
  const app = createApp();
  const grpcServer = await startProductGrpcServer({
    port: env.grpcPort,
    reserveStock: (request) => reserveStockForOrder(request, { productEventPublisher })
  });

  const kafkaConsumer = await startOrderCreatedConsumer({
    kafka,
    redisClient,
    consumerGroup: env.orderCreatedConsumerGroup,
    productEventPublisher
  });

  const server = app.listen(env.httpPort, "0.0.0.0", () => {
    console.log(`[product-service] HTTP listening on ${env.httpPort}`);
  });

  const shutdown = async () => {
    console.log("[product-service] Shutting down");
    server.close();
    await kafkaConsumer.disconnect();
    await kafkaProducer.disconnect();
    await redisClient.disconnect();
    await mongoose.disconnect();
    await new Promise((resolve) => grpcServer.tryShutdown(resolve));
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("[product-service] Startup failed", error);
  process.exit(1);
});
