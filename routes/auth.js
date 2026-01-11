// ================== auth.js ==================
import express from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import pool from "../db.js";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";

dotenv.config();
const router = express.Router();

// ---------------- EMAIL SETUP ----------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ---------------- JWT CONFIG ----------------
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!global.blacklistedTokens) global.blacklistedTokens = new Set();
const authenticateToken = (req, res, next) => next();

// ---------------- CSV CHECK -----------------
const checkStudentInCSV = async (usn, name, email, mobile) => {
  const csvPath = path.resolve("students.csv");

  return new Promise((resolve, reject) => {
    let found = false;
    fs.createReadStream(csvPath)
      .pipe(csv())
      .on("data", (row) => {
        const csvUSN = String(row.usn || "").trim();
        const csvName = String(row.name || "").trim().toLowerCase();
        const csvEmail = String(row.email || "").trim().toLowerCase();
        const csvMobile = String(row.mobile || "").trim();

        if (
          csvUSN === String(usn).trim() &&
          csvName === String(name).trim().toLowerCase() &&
          csvEmail === String(email).trim().toLowerCase() &&
          csvMobile === String(mobile).trim()
        ) {
          found = true;
        }
      })
      .on("end", () => resolve(found))
      .on("error", reject);
  });
};

// ---------------- OTP GENERATION ----------------
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP

// ===================== REGISTER STUDENT =====================
router.post("/register-student", async (req, res) => {
  try {
    const { usn, name, email, mobile, password } = req.body;

    if (!usn || !name || !email || !mobile)
      return res
        .status(400)
        .json({ error: "USN, name, email, and mobile are all required." });

    if (!/^\d{10}$/.test(String(mobile)))
      return res
        .status(400)
        .json({ error: "Mobile number must be exactly 10 digits." });

    const match = await checkStudentInCSV(usn, name, email, mobile);
    if (!match)
      return res
        .status(401)
        .json({ error: "Student not found in official records (CSV)." });

    const existing = await pool.query(
      "SELECT usn FROM students WHERE usn = $1 OR email = $2 OR mobile = $3",
      [usn, email, mobile]
    );
    if (existing.rows.length > 0)
      return res.status(409).json({ error: "Student already registered." });

    let hashedPassword = null;
    if (password && typeof password === "string") {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const insertQuery = `
      INSERT INTO students (usn, name, email, mobile, user_name, password, is_verified, is_logged_in)
      VALUES ($1, $2, $3, $4, $2, $5, FALSE, FALSE)
      RETURNING usn, name, email, mobile, user_name
    `;

    const result = await pool.query(insertQuery, [usn, name, email, mobile, hashedPassword]);
    const student = result.rows[0];

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      `UPDATE students
       SET otp_code = $1, otp_expires_at = $2, otp_attempts = 0
       WHERE usn = $3`,
      [otp, expiresAt, usn]
    );

    const payload = { usn: student.usn, name: student.name };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
    const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET);

    res.status(201).json({
      message:
        "Student registered successfully. OTP generated for SMS sending.",
      student,
      accessToken,
      refreshToken,
      otp, // ⚠️ for testing
      expiresIn: "5 minutes",
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===================== VERIFY STUDENT (GENERATES OTP) =====================
router.post("/verify-student", async (req, res) => {
  try {
    const { usn, name, email, mobile } = req.body;
    if (!usn || !name || !email || !mobile)
      return res
        .status(400)
        .json({ error: "USN, name, email, and mobile are all required." });

    const isValid = await checkStudentInCSV(usn, name, email, mobile);
    if (!isValid)
      return res
        .status(403)
        .json({ error: "Verification denied. Details not found in CSV." });

    const result = await pool.query(
      "SELECT usn, name, email, mobile, is_verified FROM students WHERE usn = $1",
      [usn]
    );

    if (result.rows.length === 0)
      return res
        .status(401)
        .json({ error: "Verification failed. Student not found." });

    const student = result.rows[0];

    if (student.is_verified)
      return res.status(400).json({ message: "Already verified." });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      `UPDATE students
       SET otp_code = $1, otp_expires_at = $2, otp_attempts = 0
       WHERE usn = $3`,
      [otp, expiresAt, usn]
    );

    res.json({
      message: "Details verified. OTP generated for app to send via SMS.",
      usn: student.usn,
      mobile: student.mobile,
      otp, // ⚠️ for testing
      expiresIn: "5 minutes",
    });
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===================== VERIFY OTP (REGISTRATION VERIFICATION) =====================
router.post("/verify-otp", async (req, res) => {
  try {
    const { usn, otp } = req.body;

    if (!usn || !otp)
      return res.status(400).json({ error: "USN and OTP are required." });

    const result = await pool.query(
      "SELECT otp_code, otp_expires_at, otp_attempts, is_verified FROM students WHERE usn = $1",
      [usn]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Student not found." });

    const student = result.rows[0];

    if (student.is_verified) {
      return res.status(200).json({ message: "Already verified." });
    }

    const now = new Date();

    if (now > new Date(student.otp_expires_at)) {
      const newOtp = generateOTP();
      const newExpiry = new Date(Date.now() + 5 * 60 * 1000);
      await pool.query(
        "UPDATE students SET otp_code = $1, otp_expires_at = $2, otp_attempts = 0 WHERE usn = $3",
        [newOtp, newExpiry, usn]
      );
      return res.status(400).json({
        error: "OTP expired. New OTP generated.",
        otp: newOtp,
      });
    }

    if (otp !== student.otp_code) {
      const attempts = student.otp_attempts + 1;
      if (attempts >= 3) {
        const newOtp = generateOTP();
        const newExpiry = new Date(Date.now() + 5 * 60 * 1000);
        await pool.query(
          "UPDATE students SET otp_code = $1, otp_expires_at = $2, otp_attempts = 0 WHERE usn = $3",
          [newOtp, newExpiry, usn]
        );
        return res.status(400).json({
          error: "Too many failed attempts. New OTP generated.",
          otp: newOtp,
        });
      } else {
        await pool.query(
          "UPDATE students SET otp_attempts = $1 WHERE usn = $2",
          [attempts, usn]
        );
        return res.status(401).json({ error: "Invalid OTP. Try again." });
      }
    }

    // ✅ OTP is correct → mark verified (NOT logged in)
    await pool.query(
      "UPDATE students SET is_verified = TRUE, otp_code = NULL, otp_attempts = 0 WHERE usn = $1",
      [usn]
    );

    res.json({ message: "OTP verified successfully. Student verified." });
  } catch (err) {
    console.error("Verify OTP error:", err);
    res.status(500).json({ error: "Server error during OTP verification." });
  }
});

// ===================== LOGIN (Triggers OTP) =====================
router.post("/login", async (req, res) => {
  try {
    const { usn, user_name, password } = req.body;

    if (!usn || !user_name || !password)
      return res
        .status(400)
        .json({ error: "USN, user_name, and password are required." });

    const result = await pool.query(
      "SELECT * FROM students WHERE usn = $1 AND user_name = $2",
      [usn, user_name]
    );

    if (result.rowCount === 0)
      return res
        .status(404)
        .json({ message: "User not found or invalid credentials." });

    const student = result.rows[0];

    // ✅ Prevent re-login if already logged in
    if (student.is_logged_in) {
      return res.status(400).json({ message: "User already logged in." });
    }

    const dbPassword =
      typeof student.password === "string"
        ? student.password
        : String(student.password || "");

    const isPasswordMatch = await bcrypt.compare(password, dbPassword);
    if (!isPasswordMatch)
      return res.status(401).json({ message: "Invalid password." });

    // 🔹 Generate login OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await pool.query(
      "UPDATE students SET otp_code = $1, otp_expires_at = $2, otp_attempts = 0 WHERE usn = $3",
      [otp, expiresAt, usn]
    );

    const payload = { usn: student.usn, name: student.name };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
    const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET);

    res.json({
      message: "Login successful. OTP generated for SMS sending.",
      student,
      accessToken,
      refreshToken,
      otp,
      expiresIn: "5 minutes",
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===================== VERIFY LOGIN OTP (Fixed) =====================
router.post("/verify-login-otp", async (req, res) => {
  try {
    const { usn, otp } = req.body;

    if (!usn || !otp)
      return res.status(400).json({ error: "USN and OTP are required." });

    const result = await pool.query(
      "SELECT otp_code, otp_expires_at, otp_attempts, is_logged_in FROM students WHERE usn = $1",
      [usn]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Student not found." });

    const student = result.rows[0];

    if (student.is_logged_in)
      return res.status(400).json({ message: "User already logged in." });

    const now = new Date();

    if (now > new Date(student.otp_expires_at)) {
      const newOtp = generateOTP();
      const newExpiry = new Date(Date.now() + 5 * 60 * 1000);
      await pool.query(
        "UPDATE students SET otp_code = $1, otp_expires_at = $2, otp_attempts = 0 WHERE usn = $3",
        [newOtp, newExpiry, usn]
      );
      return res.status(400).json({
        error: "OTP expired. New OTP generated.",
        otp: newOtp,
      });
    }

    if (otp !== student.otp_code) {
      const attempts = student.otp_attempts + 1;
      if (attempts >= 3) {
        const newOtp = generateOTP();
        const newExpiry = new Date(Date.now() + 5 * 60 * 1000);
        await pool.query(
          "UPDATE students SET otp_code = $1, otp_expires_at = $2, otp_attempts = 0 WHERE usn = $3",
          [newOtp, newExpiry, usn]
        );
        return res.status(400).json({
          error: "Too many failed attempts. New OTP generated.",
          otp: newOtp,
        });
      } else {
        await pool.query(
          "UPDATE students SET otp_attempts = $1 WHERE usn = $2",
          [attempts, usn]
        );
        return res.status(401).json({ error: "Invalid OTP. Try again." });
      }
    }

    // ✅ OTP correct → mark logged in (not verified)
    await pool.query(
      "UPDATE students SET is_logged_in = TRUE, otp_code = NULL, otp_attempts = 0 WHERE usn = $1",
      [usn]
    );

    res.json({ message: "Login OTP verified. User is now logged in." });
  } catch (err) {
    console.error("Verify Login OTP error:", err);
    res.status(500).json({ error: "Server error during OTP verification." });
  }
});

// ===================== LOGOUT =====================
router.post("/logout", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT usn, user_name FROM students WHERE is_logged_in = TRUE LIMIT 1"
    );

    if (result.rows.length === 0)
      return res.status(400).json({ message: "Already logged out." });

    const student = result.rows[0];
    await pool.query(
      "UPDATE students SET is_logged_in = FALSE, refresh_token = NULL WHERE usn = $1",
      [student.usn]
    );

    res
      .status(200)
      .json({ message: `Logout successful for ${student.user_name}.` });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ===================== DELETE ACCOUNT =====================
router.delete("/delete", async (req, res) => {
  try {
    const { usn, user_name, password } = req.body;

    if (!usn || !user_name || !password)
      return res
        .status(400)
        .json({ error: "USN, user_name, and password are required." });

    const result = await pool.query(
      "SELECT * FROM students WHERE usn = $1 AND user_name = $2",
      [usn, user_name]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ error: "Student not found." });

    const student = result.rows[0];
    const dbPassword =
      typeof student.password === "string"
        ? student.password
        : String(student.password || "");

    const isPasswordMatch = await bcrypt.compare(password, dbPassword);
    if (!isPasswordMatch)
      return res.status(401).json({ error: "Invalid password." });

    await pool.query("DELETE FROM students WHERE usn = $1", [usn]);
    res.json({ message: "Account permanently deleted." });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
