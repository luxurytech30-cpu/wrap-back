// routes/admin.js
const express = require("express");
const router = express.Router();

const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

const Category = require("../models/Category");
const Product = require("../models/Product");
const User = require("../models/User");
const Order = require("../models/Order");

// All routes here require admin
router.use(auth, admin);

//
// 2.1 Categories
//

// GET /api/admin/categories
router.get("/categories", async (req, res) => {
  const categories = await Category.find().sort({ createdAt: -1 });
  res.json(categories);
});

// POST /api/admin/categories
router.post("/categories", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    const category = await Category.create({ name });
    res.status(201).json(category);
  } catch (err) {
    console.error("Create category error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/admin/categories/:id
router.patch("/categories/:id", async (req, res) => {
  try {
    const { name } = req.body;
    const cat = await Category.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true }
    );
    if (!cat) return res.status(404).json({ message: "Category not found" });
    res.json(cat);
  } catch (err) {
    console.error("Update category error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/admin/categories/:id
router.delete("/categories/:id", async (req, res) => {
  try {
    const cat = await Category.findByIdAndDelete(req.params.id);
    if (!cat) return res.status(404).json({ message: "Category not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("Delete category error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

//
// 2.2 Products
//

// GET /api/admin/products  (with populated category so it matches your TS type)
router.get("/products", async (req, res) => {
  const products = await Product.find()
    .populate("category") // Category object
    .sort({ createdAt: -1 });
  res.json(products);
});

// POST /api/admin/products
router.post("/products", async (req, res) => {
  try {
    const {
      name,
      description,
      categoryId, // string
      image,
      isTop,
      options, // [{ optionName, priceWithoutMaam, salePriceWithoutMaam?, stock }]
    } = req.body;

    const product = await Product.create({
      name,
      description,
      category: categoryId,
      image,
      isTop: !!isTop,
      options,
    });

    const populated = await product.populate("category");
    res.status(201).json(populated);
  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// PATCH /api/admin/products/:id
router.patch("/products/:id", async (req, res) => {
  try {
    const {
      name,
      description,
      categoryId,
      image,
      isTop,
      options,
    } = req.body;

    const updated = await Product.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description,
        category: categoryId,
        image,
        isTop,
        options,
      },
      { new: true }
    ).populate("category");

    if (!updated) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(updated);
  } catch (err) {
    console.error("Update product error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// DELETE /api/admin/products/:id
router.delete("/products/:id", async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("Delete product error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

//
// 2.3 Users (show & change role)
//

// GET /api/admin/users
router.get("/users", async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  // map to your TS User: { id, username, role }
  const mapped = users.map((u) => ({
    id: u._id.toString(),
    username: u.username,
    role: u.role,
  }));
  res.json(mapped);
});

// PATCH /api/admin/users/:id/role
router.patch("/users/:id/role", async (req, res) => {
  try {
    const { role } = req.body;
    if (!["customer", "admin"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      id: user._id.toString(),
      username: user.username,
      role: user.role,
    });
  } catch (err) {
    console.error("Update user role error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

//
// 2.4 Orders (all orders)
//

router.get("/orders", async (req, res) => {
  try {
    const orders = await Order.find({
      status: { $nin: ["failed"] },
    }).sort({ createdAt: -1 });

    const mapped = orders.map((o) => ({
      id: o._id.toString(),
      date: o.createdAt.toISOString(),
      items: o.items.map((it) => ({
        productId: it.product.toString(),
        productName: it.productName,
        optionName: it.optionName,
        optionIndex: it.optionIndex,
        priceWithoutMaam: it.priceWithoutMaam,
        quantity: it.quantity,
        image: it.image,
        itemNote: it.itemNote,

        // ✅ ADD THESE:
        itemImageUrl: it.itemImageUrl || "",
        itemImagePublicId: it.itemImagePublicId || "",
      })),
      totalWithoutMaam: o.totalWithoutMaam,
      totalWithMaam: o.totalWithMaam,
      status: o.status,
      customerDetails: o.customerDetails || undefined,
    }));

    return res.json(mapped);
  } catch (err) {
    console.error("GET /orders failed:", err);
    return res.status(500).json({ message: "Failed to load orders" });
  }
});



module.exports = router;
