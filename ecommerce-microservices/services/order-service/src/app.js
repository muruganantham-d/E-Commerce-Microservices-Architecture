const express = require("express");
const { createOrderRouter } = require("./api/order.routes");

function createApp({
  redisClient,
  productGrpcClient,
  orderEventPublisher,
  orderIdempotencyTtlSeconds
}) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "order-service" });
  });

  app.use(
    "/orders",
    createOrderRouter({
      redisClient,
      productGrpcClient,
      orderEventPublisher,
      orderIdempotencyTtlSeconds
    })
  );

  app.use((error, _req, res, _next) => {
    console.error("[order-service] Request failed", error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

module.exports = {
  createApp
};
