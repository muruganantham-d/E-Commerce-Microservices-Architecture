const express = require("express");
const { createAuthRouter } = require("./api/auth.routes");

function createApp({ authEventPublisher }) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "auth-service" });
  });

  app.use("/auth", createAuthRouter({ authEventPublisher }));

  app.use((error, _req, res, _next) => {
    console.error("[auth-service] Request failed", error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

module.exports = {
  createApp
};
