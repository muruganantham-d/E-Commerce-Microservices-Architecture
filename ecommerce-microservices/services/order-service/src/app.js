const express = require("express");
const cors = require("cors");
const { createOrderRouter } = require("./api/order.routes");

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  credentials: true
};

function createApp({
  redisClient,
  productGrpcClient,
  orderEventPublisher,
  orderIdempotencyTtlSeconds
}) {
  const app = express();
  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));
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
