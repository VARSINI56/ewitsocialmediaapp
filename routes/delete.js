// routes/delete.js
import express from "express";
import pool from "../db.js";
import bcrypt from "bcryptjs";

const router = express.Router();

// ✅ DELETE ACCOUNT — permanent deletion
router.delete("/delete", async (req, res) => {
  try {
    const { usn, user_name, password } = req.body;

    if (!usn || !user_name || !password) {
      return res.status(400).json({ error: "USN, user_name, and password are required." });
    }

    const studentResult = await pool.query(
      "SELECT * FROM students WHERE usn = $1 AND user_name = $2",
      [usn.trim(), user_name.trim()]
    );

    if (studentResult.rowCount === 0) {
      return res.status(404).json({ error: "Student not found or already deleted." });
    }

    const student = studentResult.rows[0];

    // 🔑 Fix: use the correct column name for the hashed password
    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password." });
    }

    await pool.query("DELETE FROM students WHERE usn = $1", [usn]);
    console.log(`🗑️ Account permanently deleted for USN: ${usn}`);

    res.json({ message: "Account deleted successfully. You can register again." });
  } catch (err) {
    console.error("❌ Error deleting account:", err);
    res.status(500).json({ error: "Server error during deletion." });
  }
});

// ✅ Export router and helper placeholders
export const deleteExpiredAccounts = async () => {};
export const startDeletionScheduler = () => {};
export default router;
