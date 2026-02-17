const express = require("express");
const { createProductRouter } = require("./api/product.routes");

function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "product-service" });
  });

  app.use("/products", createProductRouter());

  app.use((error, _req, res, _next) => {
    console.error("[product-service] Request failed", error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

module.exports = {
  createApp
};
