// routes/payments.js
require("dotenv").config();

const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const Order = require("../models/Order");
const Product = require("../models/Product");
const User = require("../models/User");

// IMPORTANT: Tranzila sends urlencoded body
const urlencoded = express.urlencoded({ extended: true });

// URLs
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:8080";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

// Tranzila
const TRANZILA_SUPPLIER = process.env.TRANZILA_SUPPLIER || "tranzilatst";
const TRANZILA_LANG = process.env.TRANZILA_LANG || "il"; // ✅ il (not he)
const TRANZILA_CURRENCY = process.env.TRANZILA_CURRENCY || "1"; // 1=ILS

function toFixed2(n) {
  const num = Number(n || 0);
  return num.toFixed(2);
}

// Build Tranzila iframenew URL (the one you tested manually)
function buildIframeNewUrl({ order, customer = {} }) {
  const base = `https://direct.tranzila.com/${encodeURIComponent(
    TRANZILA_SUPPLIER
  )}/iframenew.php`;

  // These are BACKEND endpoints (Tranzila returns to your backend, then you redirect to frontend)
  const success_url_address = `${BACKEND_URL}/api/payments/return/success`;
  const fail_url_address = `${BACKEND_URL}/api/payments/return/fail`;
  const notify_url_address = `${BACKEND_URL}/api/payments/ipn/tranzila`;

  const params = new URLSearchParams({
    supplier: TRANZILA_SUPPLIER,
    sum: toFixed2(order.totalWithoutMaam),
    currency: String(TRANZILA_CURRENCY),
    orderid: String(order._id),

    // Return + IPN
    success_url_address,
    fail_url_address,
    notify_url_address,

    // Optional customer fields (good for receipts/CRM at Tranzila)
    company: customer.company || "",
    contact: customer.contact || order.customerDetails?.fullName || "",
    email: customer.email || order.customerDetails?.email || "",
    phone: customer.phone || order.customerDetails?.phone || "",
    address: customer.address || `${order.customerDetails?.street || ""} ${order.customerDetails?.houseNumber || ""}`.trim(),
    city: customer.city || order.customerDetails?.city || "",
    zip: customer.zip || order.customerDetails?.postalCode || "",
    remarks: customer.remarks || "",
    pdesc: customer.pdesc || "PerfectWrap Order",
    myid: customer.myid || "",

    // ✅ language that works
    lang: TRANZILA_LANG,

    // Regular transaction
    cred_type: "1",
  });

  return `${base}?${params.toString()}`;
}

/**
 * POST /api/payments/start
 * body: { orderId }
 * returns: { iframeUrl }
 */
router.post("/start", auth, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ message: "orderId is required" });

    const order = await Order.findOne({ _id: orderId, user: req.userId }).exec();
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status && order.status !== "pending") {
      return res.status(400).json({ message: "Order is not pending" });
    }

    const iframeUrl = buildIframeNewUrl({ order });

    // Optional: store for debugging
    // order.paymentMeta = { iframeUrl, startedAt: new Date().toISOString() };
    // await order.save();

    return res.json({ iframeUrl });
  } catch (err) {
    console.error("PAYMENT START ERROR:", err);
    return res.status(500).json({ message: "server error" });
  }
});
function returnHtml({ ok, orderId, clientUrl }) {
  const target = ok
    ? `${clientUrl}/payment-success?orderId=${encodeURIComponent(orderId || "")}`
    : `${clientUrl}/payment-failed?orderId=${encodeURIComponent(orderId || "")}`;

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${ok ? "Payment Success" : "Payment Failed"}</title>
</head>
<body style="font-family: Arial; padding: 20px; text-align:center;">
  <h3>${ok ? "התשלום אושר ✅" : "התשלום נכשל ❌"}</h3>
  <p>מעבירים אותך...</p>

  <script>
    (function () {
      var url = ${JSON.stringify(target)};

      // If it opened as a popup window, redirect opener
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.location.href = url;
        }
      } catch(e) {}

      // If inside iframe, redirect the top page
      try {
        if (window.top && window.top !== window) {
          window.top.location.href = url;
        }
      } catch(e) {}

      // Always redirect this window too (fallback)
      try { window.location.href = url; } catch(e) {}

      // Try closing popup (works if the window was opened by JS)
      setTimeout(function () {
        try { window.close(); } catch(e) {}
      }, 400);
    })();
  </script>
</body>
</html>`;
}
/**
 * RETURN SUCCESS (browser redirect from Tranzila)
 * Tranzila may send query or body. We accept both.
 * We redirect to FRONTEND /payment-success?orderId=...
 */
// router.all("/return/success", urlencoded, async (req, res) => {
//   const payload = { ...(req.query || {}), ...(req.body || {}) };
//   const orderId =
//     payload.orderid || payload.myorder || payload.orderId || payload.OrderId;

//   const to = new URL(`${CLIENT_URL}/payment-success`);
//   if (orderId) to.searchParams.set("orderId", String(orderId));

//   console.log("🔁 [Return SUCCESS] →", to.toString(), "payload:", payload);
//   return res.redirect(302, to.toString());
// });

// /**
//  * RETURN FAIL (browser redirect from Tranzila)
//  * redirect to FRONTEND /payment-failed?orderId=...
//  */
// router.all("/return/fail", urlencoded, async (req, res) => {
//   const payload = { ...(req.query || {}), ...(req.body || {}) };
//   const orderId =
//     payload.orderid || payload.myorder || payload.orderId || payload.OrderId;

//   const to = new URL(`${CLIENT_URL}/payment-failed`);
//   if (orderId) to.searchParams.set("orderId", String(orderId));

//   console.log("🔁 [Return FAIL] →", to.toString(), "payload:", payload);
//   return res.redirect(302, to.toString());
// });
router.all("/return/success", urlencoded, async (req, res) => {
  const payload = { ...(req.query || {}), ...(req.body || {}) };
  const orderId = payload.orderid || payload.myorder || payload.orderId || "";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(returnHtml({
    ok: true,
    orderId,
    clientUrl: CLIENT_URL, // https://www.perfectwrap2021.com
  }));
});

router.all("/return/fail", urlencoded, async (req, res) => {
  const payload = { ...(req.query || {}), ...(req.body || {}) };
  const orderId = payload.orderid || payload.myorder || payload.orderId || "";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(returnHtml({
    ok: false,
    orderId,
    clientUrl: CLIENT_URL,
  }));
});

/**
 * IPN (server-to-server notify from Tranzila)
 * Very important: must respond quickly with 200 OK.
 * We update order paid/failed and reduce stock ONCE (idempotent).
 */
router.all("/ipn/tranzila", urlencoded, async (req, res) => {
  try {
    const payload = { ...(req.query || {}), ...(req.body || {}) };

    const orderId =
      payload.orderid || payload.myorder || payload.orderId || payload.OrderId;

    // Tranzila "Response" often: "000" or "0" = approved
    const Response = payload.Response || payload.response || payload.RESPONSE;
    const approved =
      String(Response || "").trim() === "000" || String(Response || "").trim() === "0";

    console.log("📥 [IPN] payload:", payload);
    console.table({ orderId, Response, approved });

    if (!orderId) return res.status(200).send("OK");

    const order = await Order.findById(orderId).exec();
    if (!order) return res.status(200).send("OK");

    // ✅ Idempotency: if already paid, don't reduce stock again
    if (order.status === "paid") return res.status(200).send("OK");

    // Save raw payload for debugging (optional field in schema)
    order.tranzilaPayload = payload;

    if (!approved) {
      order.status = "failed";
      await order.save();
      return res.status(200).send("OK");
    }

    // SUCCESS
    order.status = "paid";

    // Reduce stock
    for (const item of order.items) {
      const productId = item.product; // in your schema it's item.product (ObjectId)
      const product = await Product.findById(productId).exec();
      if (!product) continue;

      const option = product.options?.[item.optionIndex];
      if (!option) continue;

      option.stock = Math.max(
        Number(option.stock || 0) - Number(item.quantity || 0),
        0
      );

      await product.save();
    }

    // OPTIONAL: clear cart after payment (recommended)
    const user = await User.findById(order.user).exec();
    if (user) {
      user.cart = [];
      await user.save();
    }

    await order.save();
    return res.status(200).send("OK");
  } catch (err) {
    console.error("❌ [IPN] error:", err);
    return res.status(200).send("OK"); // always 200 so Tranzila doesn't retry forever
  }
});

module.exports = router;
