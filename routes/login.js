// routes/login.js
import express from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { generateOtp } from "../utils/generateOtp.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { usn, user_name, password } = req.body;

    if (!usn || !user_name || !password) {
      return res
        .status(400)
        .json({ error: "USN, user_name, and password are required." });
    }

    // ✅ Check if student exists
    const result = await pool.query(
      "SELECT * FROM students WHERE usn = $1 AND user_name = $2",
      [usn.trim(), user_name.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Student not found." });
    }

    const student = result.rows[0];

    // ✅ Ensure stored password is a plain string before comparing
    let storedPassword = student.password;

    if (typeof storedPassword === "object" && storedPassword !== null) {
      storedPassword =
        storedPassword.hashed ||
        storedPassword.password ||
        Object.values(storedPassword)[0] ||
        "";
    }

    // ✅ Compare entered password with stored hash
    const isMatch = await bcrypt.compare(String(password), String(storedPassword));

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password." });
    }

    // ✅ Generate OTP on every successful login attempt
    const { otp, expiresAt } = generateOtp();

    // Store OTP in DB (⚠️ is_logged_in stays FALSE until OTP verified)
    await pool.query(
      `UPDATE students
       SET otp_code = $1,
           otp_expires_at = $2,
           otp_attempts = 0,
           last_login = NOW(),
           is_logged_in = FALSE
       WHERE usn = $3`,
      [otp, expiresAt, usn]
    );

    // ✅ Log OTP in console (for testing)
    console.log(`Generated OTP for ${usn}: ${otp}`);

    // ✅ Send response to frontend (OTP verification pending)
    return res.status(200).json({
      message:
        "Login successful. OTP sent to your registered number. Please verify to continue.",
      otp_for_testing: otp, // ⚠️ remove later in production
      expires_in: "5 minutes",
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Server error during login." });
  }
});

export default router;
 // remember to not change the working of the app .....