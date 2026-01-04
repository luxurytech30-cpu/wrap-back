// src/routes/upload.js
const express = require("express");
const cloudinary = require("../config/cloudinary");
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");

const router = express.Router();

router.post("/signature", auth, admin, (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);

  
  const folder = "perfect rab";

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
