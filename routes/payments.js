// routes/payments.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:8080";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

const TRANZILA_SUPPLIER = process.env.TRANZILA_SUPPLIER || "tranzilatst";
const TRANZILA_LANG = process.env.TRANZILA_LANG || "he";
const TRANZILA_CURRENCY = process.env.TRANZILA_CURRENCY || "1";
const TRANZILA_DIRECT_MODE = process.env.TRANZILA_DIRECT_MODE || "iframe"; // iframe | iframenew

const urlencoded = express.urlencoded({ extended: true });

function money2(n) {
  return Number(n || 0).toFixed(2);
}

function getDirectBaseUrl(supplier) {
  const safe = encodeURIComponent(supplier);
  if (TRANZILA_DIRECT_MODE === "iframenew") {
    return `https://direct.tranzila.com/${safe}/iframenew.php`;
  }
  return `https://direct.tranzila.com/${safe}/iframe.php`;
}

/**
 * POST /api/payments/start
 * body: { orderId, supplier? }  // supplier optional: "ahlam" or "ahlamtok"
 * returns: { iframeUrl }
 */
router.post("/start", auth, async (req, res) => {
  try {
    const { orderId, supplier } = req.body;
    if (!orderId) return res.status(400).json({ message: "orderId is required" });

    const order = await Order.findOne({ _id: orderId, user: req.userId }).exec();
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status !== "pending_payment") {
      return res.status(400).json({ message: "Order is not pending payment" });
    }

    const sum = money2(order.totalWithoutMaam);

    // Return URLs (browser redirect)
    const successReturn = `${BACKEND_URL}/api/payments/return/success?orderId=${order._id}`;
    const failReturn = `${BACKEND_URL}/api/payments/return/fail?orderId=${order._id}`;

    // IPN server-to-server callback
    const notifyUrl = `${BACKEND_URL}/api/payments/ipn/tranzila`;

    const usedSupplier = (supplier || TRANZILA_SUPPLIER).trim();
    const base = getDirectBaseUrl(usedSupplier);

    // IMPORTANT: direct.tranzila uses these param names:
    // success_url_address / fail_url_address / notify_url_address
    const params = new URLSearchParams({
      sum,
      currency: String(TRANZILA_CURRENCY),
      orderid: String(order._id),
      lang: TRANZILA_LANG,
      success_url_address: successReturn,
      fail_url_address: failReturn,
      notify_url_address: notifyUrl,

      // Optional customer details (nice to have in Tranzila UI)
      contact: order.customerDetails?.fullName || "",
      email: order.customerDetails?.email || "",
      phone: order.customerDetails?.phone || "",
      city: order.customerDetails?.city || "",
      address: `${order.customerDetails?.street || ""} ${order.customerDetails?.houseNumber || ""}`.trim(),
      remarks: order.customerDetails?.notes || "",
      pdesc: "PerfectWrap Order",
    });

    // Single payment
    params.set("cred_type", "1");

    const iframeUrl = `${base}?${params.toString()}`;

    // (optional) store startedAt
    // order.payment = { startedAt: new Date(), supplier: usedSupplier };
    // await order.save();

    return res.json({ iframeUrl });
  } catch (err) {
    console.error("PAYMENT START ERROR:", err);
    return res.status(500).json({ message: "server error" });
  }
});

/**
 * Return URLs - redirect back to frontend
 * Tranzila will send user here after payment
 */
router.all("/return/success", urlencoded, async (req, res) => {
  const orderId = req.query.orderId || req.body?.orderId;
  const to = new URL(`${CLIENT_URL}/payment-success`);
  if (orderId) to.searchParams.set("orderId", String(orderId));
  return res.redirect(302, to.toString());
});

router.all("/return/fail", urlencoded, async (req, res) => {
  const orderId = req.query.orderId || req.body?.orderId;
  const to = new URL(`${CLIENT_URL}/payment-failed`);
  if (orderId) to.searchParams.set("orderId", String(orderId));
  return res.redirect(302, to.toString());
});

/**
 * IPN callback (server-to-server)
 * Accept GET or POST
 * Tranzila commonly sends Response=000 when approved
 */
router.all("/ipn/tranzila", urlencoded, async (req, res) => {
  try {
    const payload = { ...(req.query || {}), ...(req.body || {}) };

    const orderid = payload.orderid || payload.myorder || payload.OrderId;
    const Response = String(payload.Response || payload.response || "").trim();
    const Tempref = payload.Tempref || payload.tempref || "";

    if (!orderid) return res.status(200).send("OK");

    const order = await Order.findById(orderid).exec();
    if (!order) return res.status(200).send("OK");

    // idempotent
    if (order.status === "paid") return res.status(200).send("OK");

    const approved = Response === "000" || Response === "0";

    // store gateway payload (optional)
    order.tranzila = {
      response: Response,
      tempref: Tempref,
      payload,
      at: new Date(),
    };

    if (!approved) {
      order.status = "failed";
      await order.save();
      return res.status(200).send("OK");
    }

    // SUCCESS
    order.status = "paid";
    order.paidAt = new Date();

    // Reduce stock
    for (const item of order.items) {
      const product = await Product.findById(item.product).exec();
      if (!product) continue;

      const option = product.options?.[item.optionIndex];
      if (!option) continue;

      option.stock = Math.max(Number(option.stock || 0) - Number(item.quantity || 0), 0);
      await product.save();
    }

    // Clear user's cart only now (after payment)
    const user = await User.findById(order.user).exec();
    if (user) {
      user.cart = [];
      await user.save();
    }

    await order.save();
    return res.status(200).send("OK");
  } catch (err) {
    console.error("IPN ERROR:", err);
    return res.status(200).send("OK"); // IPN should respond OK even on error to prevent retries storms
  }
});

module.exports = router;
