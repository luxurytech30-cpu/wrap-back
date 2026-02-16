// routes/payments.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const querystring = require("querystring");

const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");

// URLs
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:8080";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

// Tranzila
const TRANZILA_ENDPOINT =
  process.env.TRANZILA_ENDPOINT ||
  "https://secure5.tranzila.com/cgi-bin/tranzila31.cgi"; // You can keep this for now
const TRANZILA_SUPPLIER = process.env.TRANZILA_SUPPLIER || "tranzilatst"; // test supplier / terminal
const TRANZILA_LANG = process.env.TRANZILA_LANG || "he";

// Helpers
function toFixed2(n) {
  const num = Number(n || 0);
  return num.toFixed(2);
}

/**
 * POST /api/payments/start
 * body: { orderId }
 * returns: { paymentUrl }
 */
router.post("/start", auth, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ message: "orderId is required" });

    const order = await Order.findOne({ _id: orderId, user: req.userId }).exec();
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Only allow starting payment for pending orders
    if (order.status && order.status !== "pending") {
      return res.status(400).json({ message: "Order is not pending" });
    }

    const amount = toFixed2(order.totalWithoutMaam);

    // Browser redirects (after payment)
    const successUrl = `${CLIENT_URL}/payment-success?orderId=${order._id}`;
    const errorUrl = `${CLIENT_URL}/payment-failed?orderId=${order._id}`;

    // Server-to-server callback (recommended)
    const callbackUrl = `${BACKEND_URL}/api/payments/callback`;

    // IMPORTANT:
    // param name for server callback can differ by Tranzila configuration.
    // Many setups accept notify_url. If yours uses a different name, change it here.
    const params = {
      supplier: TRANZILA_SUPPLIER,
      sum: amount,
      currency: 1, // ILS
      tranmode: "A", // auth + charge
      cred_type: "1",
      myorder: order._id.toString(),

      success_url: successUrl,
      error_url: errorUrl,

      notify_url: callbackUrl, // <-- if Tranzila doesn't call you, rename per their docs
      lang: TRANZILA_LANG,
    };

    const paymentUrl = `${TRANZILA_ENDPOINT}?${querystring.stringify(params)}`;

    // Optional: store paymentUrl / startedAt
    // order.paymentStartedAt = new Date();
    // await order.save();

    return res.json({ paymentUrl });
  } catch (err) {
    console.error("PAYMENT START ERROR:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * Tranzila server-to-server callback
 * Tranzila might send POST or GET. We accept both.
 *
 * Expected fields (vary by config):
 *  - myorder: your order id
 *  - Response: "000" = success (commonly)
 *  - Tempref: transaction reference (optional)
 */
router.all("/callback", async (req, res) => {
  try {
    // accept both query + body
    const data = Object.keys(req.body || {}).length ? req.body : req.query;

    const myorder = data.myorder || data.Myorder || data.orderid || data.OrderId;
    const Response = data.Response || data.response || data.RESPONSE;
    const Tempref = data.Tempref || data.tempref || data.TempRef || "";

    if (!myorder) return res.status(400).send("missing myorder");

    const order = await Order.findById(myorder).exec();
    if (!order) return res.status(404).send("order not found");

    // Idempotency: if callback sent twice, do not reduce stock twice
    if (order.status === "paid") return res.send("OK");

    // Save raw response for debugging (recommended)
    // You need to add these fields in Order schema OR remove this part.
    order.tranzilaResponse = {
      responseCode: Response || "",
      tempref: Tempref || "",
      raw: data,
      receivedAt: new Date().toISOString(),
    };

    // SUCCESS
    if (Response === "000") {
      order.status = "paid";

      // Reduce stock
      for (const item of order.items) {
        // In your DB items store: item.product (ObjectId), NOT productId
        const product = await Product.findById(item.product).exec();
        if (!product) continue;

        const option = product.options?.[item.optionIndex];
        if (!option) continue;

        const newStock = Math.max(Number(option.stock || 0) - Number(item.quantity || 0), 0);
        option.stock = newStock;
        await product.save();
      }

      // OPTIONAL: Clear cart only after successful payment
      const user = await User.findById(order.user).exec();
      if (user) {
        user.cart = [];
        await user.save();
      }

      await order.save();
      return res.send("OK");
    }

    // FAIL
    order.status = "failed";
    await order.save();
    return res.send("OK");
  } catch (err) {
    console.error("PAYMENT CALLBACK ERROR:", err);
    return res.status(500).send("server error");
  }
});

module.exports = router;
