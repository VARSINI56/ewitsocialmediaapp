// routes/generateOtp.js
import express from "express";
import pool from "../db.js";
import nodemailer from "nodemailer";

const router = express.Router();

// Utility: generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000);

// Setup Nodemailer transport (use your Gmail or any SMTP account)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // your email from .env
    pass: process.env.EMAIL_PASS, // app password from Gmail
  },
});

router.post("/", async (req, res) => {
  try {
    const { usn, mobile } = req.body;

    if (!usn || !mobile)
      return res.status(400).json({ error: "USN and mobile are required." });

    // Check if student exists
    const result = await pool.query(
      "SELECT usn, email FROM students WHERE usn = $1 AND mobile = $2",
      [usn, mobile]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Student not found." });

    const student = result.rows[0];

    // Generate & store OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await pool.query(
      "UPDATE students SET otp_code = $1, otp_expires_at = $2 WHERE usn = $3",
      [otp, expiresAt, usn]
    );

    // Send OTP via email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: student.email, // student’s email from DB
      subject: "Your OTP for Student Social App",
      text: `Hello ${student.usn},\n\nYour OTP is: ${otp}\n\nIt will expire in 5 minutes.\n\nDo not share this OTP with anyone.`,
    };

    await transporter.sendMail(mailOptions);

    return res.status(200).json({
      message: "OTP sent successfully via email.",
      expiresIn: "5 minutes",
    });
  } catch (err) {
    console.error("Generate OTP error:", err);
    return res.status(500).json({ error: "Server error while generating OTP." });
  }
});

export default router;
