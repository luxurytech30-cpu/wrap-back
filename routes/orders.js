// routes/orders.js
const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");

// const MAAM_RATE = 0.17; // not used here right now

/**
 * map cart item -> order item
 * (cart.product must be populated)
 */
function mapCartItemToOrderItem(cartItem) {
  const product = cartItem.product;
  const option = product.options[cartItem.optionIndex];

  const priceWithoutMaam = option.salePriceWithoutMaam ?? option.priceWithoutMaam;

  return {
    product: product._id,
    optionIndex: cartItem.optionIndex,
    productName: product.name,
    optionName: option.optionName,
    priceWithoutMaam,
    quantity: cartItem.quantity,
    image: product.image,
    itemNote: cartItem.itemNote || "",
  };
}

/**
 * Order -> DTO for frontend
 */
function orderToDTO(order) {
  return {
    id: order._id.toString(),
    date: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      productId: item.product.toString(),
      productName: item.productName,
      optionName: item.optionName,
      optionIndex: item.optionIndex,
      priceWithoutMaam: item.priceWithoutMaam,
      quantity: item.quantity,
      image: item.image,
      itemNote: item.itemNote || "",
      itemImageUrl: item.itemImageUrl || "",
      itemImagePublicId: item.itemImagePublicId || "",
    })),

    // items only
    totalWithoutMaam: Number(order.totalWithoutMaam || 0),

    // ✅ NEW (top-level)
    shippingFee: Number(order.shippingFee || 0),
    totalToPay: Number(order.totalToPay || 0),

    // also expose method
    deliveryMethod: order.customerDetails?.deliveryMethod || "pickup",

    status: order.status,
    customerDetails: order.customerDetails,
  };
}

// POST /api/orders/checkout
router.post("/checkout", auth, async (req, res) => {
  try {
    const {
      fullName,
      phone,
      email,
      city,
      street,
      houseNumber,
      postalCode,
      notes,
      itemsMeta = [],

      // ✅ NEW from client
      deliveryMethod = "pickup", // "pickup" | "shipping"
      // shippingFee from client is ignored; we decide fee on server for safety
    } = req.body;

    // ✅ Required always
    if (!fullName || !phone) {
      return res.status(400).json({
        message: "שם מלא וטלפון הם שדות חובה",
      });
    }

    // ✅ normalize delivery method + fee
    const method = deliveryMethod === "shipping" ? "shipping" : "pickup";
    const fee = method === "shipping" ? 40 : 0;

    // ✅ Address required only for shipping
    if (method === "shipping") {
      if (!city || !street || !houseNumber) {
        return res.status(400).json({
          message: "במשלוח חובה למלא כתובת (עיר, רחוב, מספר בית)",
        });
      }
    }

    const user = await User.findById(req.userId).populate("cart.product");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.cart || user.cart.length === 0) {
      return res.status(400).json({ message: "העגלה ריקה" });
    }

    // validate stock
    for (const cartItem of user.cart) {
      const product = cartItem.product;
      const option = product.options[cartItem.optionIndex];

      if (!option) {
        return res.status(400).json({
          message: `אפשרות לא קיימת במוצר ${product.name}`,
        });
      }

      if (option.stock < cartItem.quantity) {
        return res.status(400).json({
          message: `אין מספיק מלאי במוצר ${product.name} - ${option.optionName}. נשאר ${option.stock} במלאי.`,
        });
      }
    }

    // Build quick lookup for meta by productId+optionIndex
    const metaMap = new Map();
    for (const m of itemsMeta) {
      if (!m?.productId && m?.productId !== 0) continue;
      const k = `${String(m.productId)}-${Number(m.optionIndex)}`;
      metaMap.set(k, {
        note: (m.note || "").trim(),
        imageUrl: (m.imageUrl || "").trim(),
        publicId: (m.publicId || "").trim(),
      });
    }

    // Map cart -> order items + attach meta
    const orderItems = user.cart.map((cartItem) => {
      const base = mapCartItemToOrderItem(cartItem);
      const k = `${String(cartItem.product._id)}-${Number(cartItem.optionIndex)}`;
      const meta = metaMap.get(k);

      return {
        ...base,
        itemNote: meta?.note ?? base.itemNote ?? "",
        itemImageUrl: meta?.imageUrl ?? "",
        itemImagePublicId: meta?.publicId ?? "",
      };
    });

    const itemsTotal = orderItems.reduce(
      (sum, item) => sum + item.priceWithoutMaam * item.quantity,
      0
    );

    // items only
    const totalWithoutMaam = itemsTotal;

    // charge includes shipping fee
    const totalToPay = itemsTotal + fee;

    const order = await Order.create({
      user: user._id,

      customerDetails: {
        fullName,
        phone,
        email: email || "",
        // ✅ if pickup, keep address empty so UI can hide it later
        city: method === "shipping" ? city : "",
        street: method === "shipping" ? street : "",
        houseNumber: method === "shipping" ? houseNumber : "",
        postalCode: method === "shipping" ? (postalCode || "") : "",
        notes: notes || "",

        // ✅ NEW
        deliveryMethod: method,
        shippingFee: fee,
      },

      items: orderItems,
      totalWithoutMaam,

      // ✅ NEW top-level
      shippingFee: fee,
      totalToPay,

      status: "pending",
    });

    const dto = orderToDTO(order);
    return res.json({ message: "Order created (pending payment)", order: dto });
  } catch (err) {
    console.error("CHECKOUT ERROR:", err);
    return res.status(500).json({ message: "server error" });
  }
});

// CANCEL ORDER (only within 2 hours, only if pending)
router.patch("/:id/cancel", auth, async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await Order.findById(orderId).exec();
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.user.toString() !== req.userId) {
      return res.status(403).json({ message: "Not allowed" });
    }

    if (order.status !== "pending") {
      return res
        .status(400)
        .json({ message: "Only pending orders can be canceled" });
    }

    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const createdAt = new Date(order.createdAt).getTime();
    const now = Date.now();

    if (now - createdAt > TWO_HOURS_MS) {
      return res
        .status(400)
        .json({ message: "Cancellation window expired (2 hours)" });
    }

    order.status = "canceled";
    await order.save();

    return res.json({ message: "Order canceled", order: orderToDTO(order) });
  } catch (err) {
    console.error("CANCEL ORDER ERROR:", err);
    return res.status(500).json({ message: "server error" });
  }
});

// GET /api/orders/my
router.get("/my", auth, async (req, res) => {
  try {
    const orders = await Order.find({
      user: req.userId,
      status: { $nin: ["failed"] },
    })
      .sort({ createdAt: -1 })
      .exec();

    const dtos = orders.map(orderToDTO);
    return res.json(dtos);
  } catch (err) {
    console.error("MY ORDERS ERROR:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;