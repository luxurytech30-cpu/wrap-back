// models/Order.js
const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    optionIndex: { type: Number, required: true },
    productName: { type: String, required: true },
    optionName: { type: String, required: true },
    priceWithoutMaam: { type: Number, required: true },
    quantity: { type: Number, required: true },
    image: { type: String },

    itemNote: { type: String, default: "" },
    itemImageUrl: { type: String, default: "" },
    itemImagePublicId: { type: String, default: "" },
  },
  { _id: false }
);

const customerDetailsSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: "" },

    // ✅ address is NOT required here (pickup exists)
    city: { type: String, default: "" },
    street: { type: String, default: "" },
    houseNumber: { type: String, default: "" },
    postalCode: { type: String, default: "" },

    notes: { type: String, default: "" },

    // ✅ NEW
    deliveryMethod: {
      type: String,
      enum: ["pickup", "shipping"],
      default: "pickup",
    },
    shippingFee: { type: Number, default: 0 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    customerDetails: {
      type: customerDetailsSchema,
      required: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
    },

    // items only
    totalWithoutMaam: { type: Number, required: true },

    // ✅ NEW: charge total and shipping
    shippingFee: { type: Number, default: 0 },
    totalToPay: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["pending", "paid", "shipped", "completed", "failed", "canceled"],
      default: "pending",
    },

    failedAt: { type: Date },
    tranzilaPayload: { type: Object }, // you already use it in payments.js
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", orderSchema);