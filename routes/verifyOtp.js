// routes/verifyOtp.js
import express from "express";
import pool from "../db.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { usn, otp } = req.body;

    if (!usn || !otp) {
      return res.status(400).json({ error: "USN and OTP are required." });
    }

    // 🔹 Step 1: Fetch student info
    const result = await pool.query(
      "SELECT otp_code, otp_expires_at, otp_attempts, is_verified, is_logged_in, mobile FROM students WHERE usn = $1",
      [usn]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Student not found." });
    }

    const student = result.rows[0];

    // ============================================================
    // 🔹 STEP A: Decide which OTP verification is happening
    // ============================================================
    if (student.is_verified && student.is_logged_in) {
      return res.status(400).json({
        message: "User already logged in. Logout first before re-login.",
      });
    }

    // 🔹 Step 2: Check if OTP expired
    const now = new Date();
    const expiry = new Date(student.otp_expires_at);
    if (now > expiry) {
      return res.status(400).json({
        error: "OTP has expired. Please request a new one.",
      });
    }

    // 🔹 Step 3: Compare OTP
    if (String(otp) !== String(student.otp_code)) {
      const attempts = student.otp_attempts + 1;

      // Update attempts
      await pool.query("UPDATE students SET otp_attempts = $1 WHERE usn = $2", [
        attempts,
        usn,
      ]);

      // 🔹 Step 4: After 3 failed attempts, generate new OTP
      if (attempts >= 3) {
        const newOtp = Math.floor(100000 + Math.random() * 900000);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

        await pool.query(
          "UPDATE students SET otp_code = $1, otp_expires_at = $2, otp_attempts = 0 WHERE usn = $3",
          [newOtp, expiresAt, usn]
        );

        console.log(`New OTP for ${usn}: ${newOtp}`);

        return res.status(400).json({
          error:
            "OTP incorrect 3 times. A new OTP has been sent. Please try again.",
          new_otp_for_testing: newOtp, // ⚠️ For testing only
        });
      }

      return res.status(401).json({
        error: `Invalid OTP. You have ${3 - attempts} attempts remaining.`,
      });
    }

    // ============================================================
    // 🔹 Step 5: OTP matched — update based on current user status
    // ============================================================
    if (!student.is_verified) {
      // First-time account verification
      await pool.query(
        `UPDATE students 
         SET is_verified = TRUE,
             otp_code = NULL,
             otp_expires_at = NULL,
             otp_attempts = 0
         WHERE usn = $1`,
        [usn]
      );

      return res.status(200).json({
        message: "Account verified successfully. You can now set up your profile.",
      });
    } else {
      // Login OTP verification (after logout)
      await pool.query(
        `UPDATE students 
         SET is_logged_in = TRUE,
             otp_code = NULL,
             otp_expires_at = NULL,
             otp_attempts = 0
         WHERE usn = $1`,
        [usn]
      );

      return res.status(200).json({
        message: "Login OTP verified successfully. You are now logged in.",
      });
    }
  } catch (error) {
    console.error("Verify OTP error:", error);
    return res
      .status(500)
      .json({ error: "Server error during OTP verification." });
  }
});

export default router;
