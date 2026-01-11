import express from "express";
import pool from "../db.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    // Find the first student who is currently logged in
    const result = await pool.query("SELECT * FROM students WHERE is_logged_in = true LIMIT 1");

    if (result.rows.length === 0) {
      return res.status(400).json({ message: "Already logged out" });
    }

    const student = result.rows[0];

    // Set is_logged_in = false
    await pool.query("UPDATE students SET is_logged_in = false WHERE usn = $1", [student.usn]);

    res.status(200).json({ message: `Logout successful for ${student.user_name}` });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Server error during logout." });
  }
});

export default router;
 // remember to not change the working of the app .....