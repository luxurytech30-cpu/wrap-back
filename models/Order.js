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
    itemNote: { type: String, default: "" }, // ✅ NEW
        itemImageUrl: { type: String, default: "" },
    itemImagePublicId: { type: String, default: "" },


  },
  { _id: false }
);

const customerDetailsSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String },
    city: { type: String, required: true },
    street: { type: String, required: true },
    houseNumber: { type: String, required: true },
    postalCode: { type: String },
    notes: { type: String },
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

    totalWithoutMaam: { type: Number, required: true },
    

    status: {
      type: String,
      enum: ["pending", "paid", "shipped", "completed", "failed", "canceled"],
      default: "pending",
    },

    failedAt: { type: Date },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

module.exports = mongoose.model("Order", orderSchema);
