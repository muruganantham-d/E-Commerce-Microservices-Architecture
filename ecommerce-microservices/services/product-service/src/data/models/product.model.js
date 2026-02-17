const mongoose = require("mongoose");

const reservationSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, index: true },
    quantity: { type: Number, required: true },
    status: { type: String, enum: ["reserved", "confirmed", "released"], default: "reserved" },
    reservedAt: { type: Date, required: true },
    confirmedAt: { type: Date }
  },
  {
    _id: false
  }
);

const productSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, unique: true, index: true },
    sku: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "USD" },
    inventory: { type: Number, required: true, min: 0 },
    isActive: { type: Boolean, default: true },
    reservations: { type: [reservationSchema], default: [] }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

module.exports = mongoose.model("Product", productSchema);
