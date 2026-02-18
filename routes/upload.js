// src/routes/upload.js
const express = require("express");
const cloudinary = require("../config/cloudinary");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

const router = express.Router();
console.log("✅ upload routes loaded");

// src/routes/upload.js
router.post("/signature/cart", auth, (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = "perfect-rab/cart-items"; // תעשה שם בלי רווחים

  const paramsToSign = { timestamp, folder };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );

  res.json({
    timestamp,
    signature,
    apiKey: process.env.CLOUDINARY_API_KEY,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    folder,
  });
});



module.exports = router;
