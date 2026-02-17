const express = require("express");
const { randomUUID } = require("crypto");
const Product = require("../data/models/product.model");

function createProductId() {
  return `prd_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function createSku() {
  return `SKU-${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function createProductRouter() {
  const router = express.Router();

  router.post("/", async (req, res, next) => {
    try {
      const { productId, sku, name, price, currency = "USD", inventory = 0, isActive = true } = req.body || {};

      if (!name || price === undefined) {
        return res.status(400).json({ error: "name and price are required" });
      }

      const created = await Product.create({
        productId: productId || createProductId(),
        sku: sku || createSku(),
        name,
        price,
        currency,
        inventory,
        isActive
      });

      return res.status(201).json({
        productId: created.productId,
        sku: created.sku,
        name: created.name,
        price: created.price,
        currency: created.currency,
        inventory: created.inventory,
        isActive: created.isActive
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:productId", async (req, res, next) => {
    try {
      const product = await Product.findOne({ productId: req.params.productId }).lean();
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      return res.status(200).json({
        productId: product.productId,
        sku: product.sku,
        name: product.name,
        price: product.price,
        currency: product.currency,
        inventory: product.inventory,
        isActive: product.isActive
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = {
  createProductRouter
};
