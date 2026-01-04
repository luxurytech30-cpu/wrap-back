// models/Product.js
const mongoose = require("mongoose");

const optionSchema = new mongoose.Schema({
  optionName: { type: String, required: true },
  priceWithoutMaam: { type: Number, required: true },
  salePriceWithoutMaam: { type: Number }, // optional
  stock: { type: Number, default: 0 },
});

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },

    // ⬇⬇ IMPORTANT CHANGE HERE ⬇⬇
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",          // link to Category model
      required: true,
    },

    image: { type: String, required: true },
    isTop: { type: Boolean, default: false },
    options: { type: [optionSchema], required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
