// routes/payments.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Order = require("../models/Order");
const querystring = require("querystring");

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:8080";

// FROM TRANZILA – for test you’ll get test supplier
const TRANZILA_ENDPOINT =
  process.env.TRANZILA_ENDPOINT ||
  "https://secure5.tranzila.com/cgi-bin/tranzila31.cgi";
const TRANZILA_SUPPLIER =
  process.env.TRANZILA_SUPPLIER || "tranzilatst"; // test supplier name

// POST /api/payments/start
// body: { orderId }
router.post("/start", auth, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ message: "orderId is required" });
    }

    const order = await Order.findOne({ _id: orderId, user: req.userId });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const amount = order.totalWithoutMaam.toFixed(2);

    const successUrl = `${CLIENT_URL}/payment-success?orderId=${order._id}`;
    const errorUrl = `${CLIENT_URL}/payment-failed?orderId=${order._id}`;

    const params = {
      supplier: TRANZILA_SUPPLIER,          // only this changes test/live
      sum: amount,                          // amount in ILS
      currency: 1,                          // 1 = ILS
      tranmode: "A",                        // auth+charge
      cred_type: "1",                       // regular transaction
      myorder: order._id.toString(),        // your order ID
      success_url: successUrl,
      error_url: errorUrl,
      lang: "he",
    };

    const paymentUrl = `${TRANZILA_ENDPOINT}?${querystring.stringify(params)}`;

    return res.json({ paymentUrl });
  } catch (err) {
    console.error("PAYMENT START ERROR:", err);
    return res.status(500).json({ message: "server error" });
  }
});

// Tranzila server-to-server callback
// EXACT field names / GET vs POST depend on Tranzila docs.
// This is the structure; you’ll adjust names when you get the PDF.
router.post("/callback", async (req, res) => {
  try {
    // body or query (depends how Tranzila is configured)
    const data = Object.keys(req.body).length ? req.body : req.query;
    const { myorder, Response, Tempref } = data; // Tempref = transaction id (optional)

    if (!myorder) {
      return res.status(400).send("missing myorder");
    }

    const order = await Order.findById(myorder);
    if (!order) {
      return res.status(404).send("order not found");
    }

    if (Response === "000") {
      // SUCCESS
      order.status = "paid";


      // reduce stock
      for (const item of order.items) {
        const product = await Product.findById(item.productId);
        if (!product) continue;

        const option = product.options[item.optionIndex];
        if (!option) continue;

        option.stock = Math.max(option.stock - item.quantity, 0);
        await product.save();
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
