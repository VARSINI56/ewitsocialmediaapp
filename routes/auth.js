// ================== auth.js ==================
import express from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import pool from "../db.js";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import bcrypt from "bcryptjs";

dotenv.config();
const router = express.Router();

// TEMP STORAGE FOR VERIFIED USER
if (!global.verifiedStudents) {
  global.verifiedStudents = new Set();
}


// ---------------- OTP ----------------
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// ---------------- CSV CHECK ----------------
const checkStudentInCSV = async (usn, name, email, mobile) => {
  const csvPath = path.resolve("students.csv");

  return new Promise((resolve, reject) => {
    let found = false;
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row) => {
        if (
          String(row.usn).trim() === String(usn).trim() &&
          String(row.name).trim().toLowerCase() === name.toLowerCase() &&
          String(row.email).trim().toLowerCase() === email.toLowerCase() &&
          String(row.mobile).trim() === String(mobile).trim()
        ) {
          found = true;
        }
      })
      .on("end", () => resolve(found))
      .on("error", reject);
  });
};

// ================= VERIFY STUDENT =================
// ================= VERIFY STUDENT =================
router.post("/verify-student", async (req, res) => {
  try {
    const { usn, name, email, mobile } = req.body;

    if (!usn || !name || !email || !mobile) {
      return res.status(400).json({ error: "All fields required" });
    }

    const valid = await checkStudentInCSV(usn, name, email, mobile);
    if (!valid) {
      return res.status(403).json({ error: "Student not found in CSV" });
    }

    // 🔑 ENSURE STUDENT ROW EXISTS (this was missing)
  

    await pool.query(
  `INSERT INTO students (usn, name, email, mobile, is_verified, otp_attempts)
   VALUES ($1, $2, $3, $4, FALSE, 0)
   ON CONFLICT (usn) DO NOTHING`,
  [usn, name, email, mobile]
);


    const otp = generateOTP();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      `UPDATE students
       SET otp_code = $1,
           otp_expires_at = $2,
           otp_attempts = 0
       WHERE usn = $3`,
      [otp, expiry, usn]
    );

    res.json({
      message: "Details verified. OTP generated.",
      otp, // testing only
    });
  } catch (err) {
    console.error("Verify student error:", err);
    res.status(500).json({ error: "Server error" });
  }
});






// ================= VERIFY OTP =================
router.post("/verify-otp", async (req, res) => {
  try {
    const { usn, otp } = req.body;

    if (!usn || !otp) {
      return res.status(400).json({ error: "USN and OTP are required." });
    }

    const result = await pool.query(
      `SELECT otp_code, otp_attempts, otp_expires_at, is_verified
       FROM students WHERE usn = $1`,
      [usn]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Student not found." });
    }

    const student = result.rows[0];

    if (student.is_verified) {
      return res.json({ message: "Student already verified." });
    }

    if (student.otp_attempts >= 3) {
      return res.status(403).json({
        error: "Too many unsuccessful attempts. Please resend OTP."
      });
    }

    if (new Date() > new Date(student.otp_expires_at)) {
      return res.status(400).json({
        error: "OTP expired. Please resend OTP."
      });
    }

    if (otp !== student.otp_code) {
      const attempts = (student.otp_attempts || 0) + 1;

      await pool.query(
        "UPDATE students SET otp_attempts = $1 WHERE usn = $2",
        [attempts, usn]
      );

      if (attempts >= 3) {
        return res.status(403).json({
          error: "OTP failed. Please resend OTP."
        });
      }

      return res.status(401).json({
        error: `OTP incorrect. Attempts left: ${3 - attempts}`
      });
    }

    // ✅ OTP correct → verify student
    await pool.query(
      `UPDATE students
       SET is_verified = TRUE,
           otp_code = NULL,
           otp_attempts = 0,
           otp_expires_at = NULL
       WHERE usn = $1`,
      [usn]
    );

    // 🔑 THIS WAS MISSING
    global.verifiedStudents.add(usn);

    return res.json({
      message: "Student verified successfully."
    });

  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({
      error: "Server error during OTP verification."
    });
  }
});

// ================= RESEND OTP =================
router.post("/resend-otp", async (req, res) => {
  try {
    const { usn } = req.body;

    if (!usn) {
      return res.status(400).json({ error: "USN is required." });
    }

    const otp = generateOTP();
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      `UPDATE students
       SET otp_code = $1,
           otp_expires_at = $2,
           otp_attempts = 0
       WHERE usn = $3`,
      [otp, expiry, usn]
    );

    res.json({
      message: "New OTP sent.",
      otp // testing only
    });

  } catch (err) {
    console.error("Resend OTP error:", err);
    res.status(500).json({ error: "Server error while resending OTP." });
  }
});

// ================= COMPLETE REGISTRATION =================
// ================= COMPLETE REGISTRATION =================

// ================= COMPLETE REGISTRATION =================
router.post("/complete-registration", async (req, res) => {
  try {
    const { usn, display_name, password } = req.body;

    // 🔹 USN is now mandatory
    if (!usn || !display_name || !password) {
      return res.status(400).json({
        error: "USN, display name, and password are required.",
      });
    }

    const result = await pool.query(
      "SELECT is_verified FROM students WHERE usn = $1",
      [usn]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Student not found." });
    }

    if (!result.rows[0].is_verified) {
      return res
        .status(403)
        .json({ error: "Student not verified. OTP verification required." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Update student: display_name, password, and set is_logged_in = TRUE
    const updateResult = await pool.query(
      `UPDATE students
       SET user_name = $1,
           password = $2,
           is_logged_in = TRUE
       WHERE usn = $3
       RETURNING usn, user_name, is_logged_in;`,
      [display_name, hashedPassword, usn]
    );

    if (updateResult.rows.length === 0) {
      return res.status(500).json({ error: "Failed to update login status." });
    }

    res.json({
      message: "Registration completed successfully.",
      student: updateResult.rows[0],
    });
  } catch (err) {
    console.error("Complete registration error:", err);
    res.status(500).json({ error: "Server error" });
  }
});



export default router;
