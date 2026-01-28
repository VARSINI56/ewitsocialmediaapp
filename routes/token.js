// routes/token.js
const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const pool = require("../db");

/**
 * ✅ Generate new Access Token
 * Access token valid for 30 days (auto-refreshed silently via refresh token).
 */
const generateAccessToken = (student) =>
  jwt.sign(student, process.env.JWT_ACCESS_SECRET, { expiresIn: "30d" });

/**
 * ✅ Refresh Access Token using valid Refresh Token
 * Refresh token has NO expiry — used to silently re-issue new access tokens.
 */
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body;

  // 1️⃣ Ensure token present
  if (!refreshToken) {
    return res.status(400).json({ message: "Refresh token required." });
  }

  try {
    // 2️⃣ Find matching refresh token in DB
    const result = await pool.query(
      "SELECT id, email, refresh_token FROM students WHERE refresh_token = $1",
      [refreshToken]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ message: "Invalid refresh token." });
    }

    const student = result.rows[0];

    // 3️⃣ Verify the refresh token signature
    jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err) => {
      if (err) {
        return res.status(403).json({ message: "Invalid or tampered refresh token." });
      }

      // 4️⃣ Generate a new access token
      const payload = { id: student.id, email: student.email };
      const newAccessToken = generateAccessToken(payload);

      // 5️⃣ Send new token
      res.status(200).json({
        message: "Access token refreshed successfully.",
        accessToken: newAccessToken,
      });
    });
  } catch (error) {
    console.error("Error refreshing access token:", error);
    res.status(500).json({ message: "Server error while refreshing token." });
  }
});

module.exports = router;

//“This file handles JWT token refresh and access token generation.
// Integrate with login flow when protected routes are required.”