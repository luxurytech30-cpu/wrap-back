const express = require("express");
const cors = require("cors");
require("dotenv").config();
const createConnection = require("./connection/index");
const productRoutes = require("./routes/products");
const categoryRoutes = require("./routes/categories");
const contactRoutes = require("./routes/contact");
const authRoutes =require("./routes/auth");
const cartRoutes = require("./routes/cart");
const ordersRoutes = require("./routes/orders");
const paymentsRoutes = require("./routes/payments");
const adminRoutes = require("./routes/admin");

// app.js / server.js
const uploadRoutes = require("./routes/upload");
;



const app = express();

createConnection();

// Middlewares
app.use(cors());
app.use(express.json());


// routes
app.get("/api/test", (req, res) => {
  res.json({ message: "Test route is working" });
});
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/payments", paymentsRoutes);
// ...
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);
// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
