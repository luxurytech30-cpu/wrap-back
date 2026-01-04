// routes/cart.js
const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const User = require("../models/User");
const Product = require("../models/Product");

/**
 * Helper: convert user.cart (with populated product)
 * to frontend CartItem[]
 */
function mapCartToDTO(cart) {
  return cart.map((item) => {
    const product = item.product;
    const option = product.options[item.optionIndex];

    return {
      productId: product._id.toString(),
      productName: product.name,
      optionName: option.optionName,
      optionIndex: item.optionIndex,
      itemNote: item.itemNote || "",

      // use sale price if exists, else normal price
      priceWithoutMaam:
        option.salePriceWithoutMaam ?? option.priceWithoutMaam,
      quantity: item.quantity,
      image: product.image,
    };
  });
}

// GET /api/cart – get current user's cart
router.get("/", auth, async (req, res) => {
  try {
    // Load user + populate products
    const user = await User.findById(req.userId).populate({
      path: "cart.product",
      select: "name image options",
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 1) Filter out invalid items (product === null)
    const filteredCart = user.cart.filter((item) => item.product);

    // 2) If something was removed — save updated cart
    if (filteredCart.length !== user.cart.length) {
      user.cart = filteredCart;
      await user.save();
    }

    // 3) Map the cart to DTO (only valid items remain)
    const dto = mapCartToDTO(filteredCart);

    return res.json(dto);
  } catch (err) {
    console.error("CART GET ERROR:", err);
    return res.status(500).json({ message: "server error" });
  }
});


// POST /api/cart/add
// body: { productId, optionIndex, quantity }
// POST /api/cart/add
// body: { productId, optionIndex, quantity }
router.post("/add", auth, async (req, res) => {
  try {
    const { productId, optionIndex, quantity = 1 } = req.body;

    if (!productId || typeof optionIndex !== "number") {
      return res
        .status(400)
        .json({ message: "productId and optionIndex are required" });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // find existing cart item
    const existingItem = user.cart.find(
      (item) =>
        item.product.toString() === productId &&
        item.optionIndex === optionIndex
    );

    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      user.cart.push({
        product: productId, // mongoose will cast string -> ObjectId
        optionIndex,
        quantity,
         itemNote: "", // ✅ NEW
      });
    }

    await user.save();

    // populate only once to build DTO
    await user.populate({
      path: "cart.product",
      select: "name image options",
    });
    const dto = mapCartToDTO(user.cart);

    return res.json({ message: "Added to cart", cart: dto });
  } catch (err) {
    console.error("CART ADD ERROR:", err);
    return res.status(500).json({ message: "server error" });
  }
});

// PATCH /api/cart/note
// body: { productId, optionIndex, itemNote }
router.patch("/note", auth, async (req, res) => {
  try {
    const { productId, optionIndex, itemNote } = req.body;

    if (!productId || typeof optionIndex !== "number") {
      return res.status(400).json({
        message: "productId and optionIndex are required",
      });
    }

    const safeNote = String(itemNote || "").trim().slice(0, 500);

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const existingItem = user.cart.find(
      (item) =>
        item.product.toString() === productId &&
        item.optionIndex === optionIndex
    );

    if (!existingItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    existingItem.itemNote = safeNote;

    await user.save();
    await user.populate({
      path: "cart.product",
      select: "name image options",
    });

    const dto = mapCartToDTO(user.cart);
    return res.json({ message: "Note updated", cart: dto });
  } catch (err) {
    console.error("CART NOTE ERROR:", err);
    return res.status(500).json({ message: "server error" });
  }
});


// PATCH /api/cart/update
// body: { productId, optionIndex, quantity }
router.patch("/update", auth, async (req, res) => {
  try {
    const { productId, optionIndex, quantity } = req.body;

    if (
      !productId ||
      typeof optionIndex !== "number" ||
      typeof quantity !== "number"
    ) {
      return res.status(400).json({
        message: "productId, optionIndex and quantity are required",
      });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const existingItem = user.cart.find(
      (item) =>
        item.product.toString() === productId &&
        item.optionIndex === optionIndex
    );

    if (!existingItem) {
      return res.status(404).json({ message: "Cart item not found" });
    }

    if (quantity <= 0) {
      // remove item
      user.cart = user.cart.filter(
        (item) =>
          !(
            item.product.toString() === productId &&
            item.optionIndex === optionIndex
          )
      );
    } else {
      existingItem.quantity = quantity;
    }

    await user.save();
    await user.populate({
      path: "cart.product",
      select: "name image options",
    });
    const dto = mapCartToDTO(user.cart);

    return res.json({ message: "Cart updated", cart: dto });
  } catch (err) {
    console.error("CART UPDATE ERROR:", err);
    return res.status(500).json({ message: "server error" });
  }
});

// DELETE /api/cart/item
// body: { productId, optionIndex }
router.delete("/item", auth, async (req, res) => {
  try {
    const { productId, optionIndex } = req.body;

    if (!productId || typeof optionIndex !== "number") {
      return res
        .status(400)
        .json({ message: "productId and optionIndex are required" });
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.cart = user.cart.filter(
      (item) =>
        !(
          item.product.toString() === productId &&
          item.optionIndex === optionIndex
        )
    );

    await user.save();
    await user.populate({
      path: "cart.product",
      select: "name image options",
    });
    const dto = mapCartToDTO(user.cart);

    return res.json({ message: "Cart item removed", cart: dto });
  } catch (err) {
    console.error("CART ITEM DELETE ERROR:", err);
    return res.status(500).json({ message: "server error" });
  }
});

// DELETE /api/cart/clear
router.delete("/clear", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.cart = [];
    await user.save();

    return res.json({ message: "Cart cleared", cart: [] });
  } catch (err) {
    console.error("CART CLEAR ERROR:", err);
    return res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
