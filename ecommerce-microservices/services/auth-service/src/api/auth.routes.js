const express = require("express");
const { randomUUID } = require("crypto");
const User = require("../data/models/user.model");

function createUserId() {
  return `usr_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function createAuthRouter({ authEventPublisher }) {
  const router = express.Router();

  router.post("/register", async (req, res, next) => {
    try {
      const { email, password } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
      }

      const existingUser = await User.findOne({ email }).lean();
      if (existingUser) {
        return res.status(409).json({ error: "User already exists" });
      }

      const user = await User.create({
        userId: createUserId(),
        email,
        password,
        roles: ["customer"],
        status: "active"
      });

      await authEventPublisher.publishUserCreated({
        userId: user.userId,
        email: user.email,
        roles: user.roles,
        status: user.status,
        createdAt: user.createdAt.toISOString()
      });

      return res.status(201).json({
        userId: user.userId,
        email: user.email,
        roles: user.roles,
        status: user.status
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const { email, password } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({ error: "email and password are required" });
      }

      const user = await User.findOne({ email });
      if (!user || user.password !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const token = Buffer.from(`${user.userId}:${Date.now()}`).toString("base64");
      return res.status(200).json({
        token,
        user: {
          userId: user.userId,
          email: user.email,
          roles: user.roles,
          status: user.status
        }
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = {
  createAuthRouter
};

