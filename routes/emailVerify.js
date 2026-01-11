import express from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import pool from "../db.js";

dotenv.config();
const router = express.Router();

/**
 * ✅ GET /api/verify/confirm/:token
 * When the user clicks the email link, this route is triggered.
 */
router.get("/confirm/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { usn } = decoded;

    // Mark the student as confirmed
    await pool.query("UPDATE students SET is_confirmed = TRUE WHERE usn = $1", [usn]);

    // Redirect to frontend setup page
    return res.redirect(`${process.env.FRONTEND_URL}/setup-profile?usn=${usn}`);
  } catch (err) {
    console.error("Email confirmation error:", err);
    return res.status(400).send("Invalid or expired link.");
  }
});

export default router;
