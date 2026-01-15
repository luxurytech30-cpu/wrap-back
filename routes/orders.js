// routes/orders.js
const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const User = require("../models/User");
const Product = require("../models/Product");
const Order = require("../models/Order");

const MAAM_RATE = 0.17;

/**
 * map cart item -> order item
 * (cart.product must be populated)
 */
function mapCartItemToOrderItem(cartItem) {
  const product = cartItem.product;
  const option = product.options[cartItem.optionIndex];

  const priceWithoutMaam =
    option.salePriceWithoutMaam ?? option.priceWithoutMaam;
  
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

    })),
    totalWithoutMaam: order.totalWithoutMaam,
    
    status: order.status,
    customerDetails: order.customerDetails,
  };
}

// POST /api/orders/checkout
// body: customer details (fullName, phone, etc.)
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
    } = req.body;

    if (!fullName || !phone || !city || !street || !houseNumber) {
      return res.status(400).json({
        message: "שם מלא, טלפון וכתובת (עיר, רחוב, מספר בית) הם שדות חובה",
      });
    }

    // load user + cart
    const user = await User.findById(req.userId).populate("cart.product");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.cart || user.cart.length === 0) {
      return res.status(400).json({ message: "העגלה ריקה" });
    }

    // validate stock (soft check – you can also deduct later after payment)
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

    const orderItems = user.cart.map(mapCartItemToOrderItem);

    const totalWithoutMaam = orderItems.reduce(
      (sum, item) => sum + item.priceWithoutMaam * item.quantity,
      0
    );
    

    const order = await Order.create({
      user: user._id,
      customerDetails: {
        fullName,
        phone,
        email: email || "",
        city,
        street,
        houseNumber,
        postalCode: postalCode || "",
        notes: notes || "",
      },
      items: orderItems,
      totalWithoutMaam,
      
      status: "pending",
    });

    // clear cart
    user.cart = [];
    await user.save();

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

    // must belong to current user
    if (order.user.toString() !== req.userId) {
      return res.status(403).json({ message: "Not allowed" });
    }

    // only pending orders can be canceled
    if (order.status !== "pending") {
      return res.status(400).json({ message: "Only pending orders can be canceled" });
    }

    // 2 hours rule (server time)
    const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
    const createdAt = new Date(order.createdAt).getTime();
    const now = Date.now();

    if (now - createdAt > TWO_HOURS_MS) {
      return res.status(400).json({ message: "Cancellation window expired (2 hours)" });
    }

    order.status = "canceled";
    await order.save();

    return res.json({ message: "Order canceled", order: orderToDTO(order) });
  } catch (err) {
    console.error("CANCEL ORDER ERROR:", err);
    return res.status(500).json({ message: "server error" });
  }
});



// GET /api/orders/my  – get current user's orders
router.get("/my", auth, async (req, res) => {
  try {
    const orders = await Order.find({
      user: req.userId,
      status: { $nin: ["failed"] }   // EXCLUDE these
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
