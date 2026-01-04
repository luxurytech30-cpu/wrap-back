// routes/auth.js
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth"); 
const router = express.Router();

// POST /api/auth/register
// Use this once with Postman to create users (admin, customer, etc.)
router.post("/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "username and password required" });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ message: "username already exists" });
    }

    const user = await User.create({
      username,
      password, // plain password (as you chose)
      role: role || "customer",
    });

    res.status(201).json({
      message: "user created",
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // check username + password in DB
    const user = await User.findOne({ username, password });
    if (!user) {
      return res.status(401).json({ message: "שם משתמש או סיסמה שגויים" });
    }

    // create JWT token
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET || "dev-secret",
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});

// GET /api/auth/me  <-- your route, fixed
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("_id username role");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      id: user._id.toString(),
      username: user.username,
      role: user.role,
    });
  } catch (err) {
    console.error("ME ERROR:", err);
    res.status(500).json({ message: "server error" });
  }
});


module.exports = router;
