import express from "express";
import pool from "../db.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { usn } = req.body;

    // ✅ USN is mandatory
    if (!usn) {
      return res.status(400).json({ error: "USN is required for logout." });
    }

    // ✅ Check if this student is currently logged in
    const result = await pool.query(
      "SELECT * FROM students WHERE usn = $1 AND is_logged_in = true",
      [usn]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "User already logged out or not found." });
    }

    const student = result.rows[0];

    // ✅ Set is_logged_in = false
    await pool.query(
      "UPDATE students SET is_logged_in = false WHERE usn = $1",
      [student.usn]
    );

    res.status(200).json({ message: `Logout successful for ${student.user_name}` });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Server error during logout." });
  }
});

export default router;
