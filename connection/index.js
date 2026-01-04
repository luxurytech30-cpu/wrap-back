const mongoose = require("mongoose");
require("dotenv").config();

async function createConnection() {
  try {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      throw new Error("MONGO_URI is missing in .env file");
    }

    await mongoose.connect(uri); // <-- IMPORTANT: no options here

    console.log("✅ Connected to MongoDB Atlas");
  } catch (ex) {
    console.error("❌ Connection failed:", ex.message);
    process.exit(1);
  }
}

module.exports = createConnection;
