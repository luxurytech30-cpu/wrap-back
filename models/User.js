const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    optionIndex: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    itemNote: {
      type: String,
      default: "",
      maxlength: 500,
      trim: true,
    }, // ✅ NEW
  },
  { _id: false }
);


const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // plain as you chose
  role: {
    type: String,
    enum: ["customer", "admin"],
    default: "customer",
  },
  cart: {
    type: [cartItemSchema],
    default: [],          // <-- important
  }, 
});

module.exports = mongoose.model("User", userSchema);
