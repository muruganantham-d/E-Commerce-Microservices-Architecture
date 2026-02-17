const express = require("express");
const { randomUUID } = require("crypto");
const Order = require("../data/models/order.model");
const { checkAndReserveStock } = require("../grpc/product.client");

function createOrderId() {
  return `ord_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    productId: item.productId,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice || 0)
  }));
}

function calculateTotalAmount(items) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

function createOrderRouter({
  redisClient,
  productGrpcClient,
  orderEventPublisher,
  orderIdempotencyTtlSeconds
}) {
  const router = express.Router();

  router.post("/", async (req, res, next) => {
    const idempotencyKey = req.header("Idempotency-Key");
    if (!idempotencyKey) {
      return res.status(400).json({ error: "Idempotency-Key header is required" });
    }

    const lockKey = `idem:http:orders:${idempotencyKey}`;
    const responseKey = `${lockKey}:response`;

    try {
      const claimed = await redisClient.set(lockKey, "processing", {
        NX: true,
        EX: orderIdempotencyTtlSeconds
      });

      if (!claimed) {
        const cachedResponse = await redisClient.get(responseKey);
        if (cachedResponse) {
          const parsed = JSON.parse(cachedResponse);
          return res.status(200).set("Idempotent-Replay", "true").json(parsed);
        }

        return res.status(409).json({ error: "Request is already being processed" });
      }

      const { userId, currency = "USD" } = req.body || {};
      const items = normalizeItems(req.body && req.body.items);

      if (!userId || items.length === 0) {
        await redisClient.del(lockKey);
        return res.status(400).json({ error: "userId and items are required" });
      }

      if (items.some((item) => !item.productId || item.quantity <= 0 || item.unitPrice < 0)) {
        await redisClient.del(lockKey);
        return res.status(400).json({ error: "items must include productId, quantity, unitPrice" });
      }

      const orderId = createOrderId();

      const reserveResponse = await checkAndReserveStock(productGrpcClient, {
        orderId,
        userId,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity
        }))
      });

      if (!reserveResponse.success) {
        await redisClient.del(lockKey);
        return res.status(409).json({ error: reserveResponse.message || "Stock reservation failed" });
      }

      const totalAmount = calculateTotalAmount(items);
      const createdOrder = await Order.create({
        orderId,
        userId,
        items,
        totalAmount,
        currency,
        status: "created"
      });

      await orderEventPublisher.publishOrderCreated({
        orderId: createdOrder.orderId,
        userId: createdOrder.userId,
        items: createdOrder.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice
        })),
        totalAmount: createdOrder.totalAmount,
        currency: createdOrder.currency,
        status: createdOrder.status,
        createdAt: createdOrder.createdAt.toISOString()
      });

      const responseBody = {
        orderId: createdOrder.orderId,
        userId: createdOrder.userId,
        status: createdOrder.status,
        totalAmount: createdOrder.totalAmount,
        currency: createdOrder.currency,
        items: createdOrder.items
      };

      await redisClient.set(responseKey, JSON.stringify(responseBody), { EX: 60 * 60 * 24 });
      await redisClient.set(lockKey, "completed", { XX: true, EX: 60 * 60 * 24 });

      console.log(`[order-service] Created orderId=${createdOrder.orderId}`);
      return res.status(201).json(responseBody);
    } catch (error) {
      await redisClient.del(lockKey);
      return next(error);
    }
  });

  return router;
}

module.exports = {
  createOrderRouter
};
