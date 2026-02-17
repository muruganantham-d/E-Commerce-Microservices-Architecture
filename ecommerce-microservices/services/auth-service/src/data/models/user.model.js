const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    roles: { type: [String], default: ["customer"] },
    status: { type: String, default: "active" }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports = mongoose.model("AuthUser", userSchema);
