// middleware/auth.js
const jwt = require("jsonwebtoken");

module.exports = async function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // decoded: { id, username, role, iat, exp } – depends on how you signed
    req.userId = decoded.id;
    req.userRole = decoded.role;

    // IMPORTANT: so admin middleware can use req.user
    req.user = {
      id: decoded.id,
      role: decoded.role,
      username: decoded.username,
    };

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
