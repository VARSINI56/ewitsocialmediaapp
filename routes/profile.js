import express from "express";
import pool from "../db.js";
import bcrypt from "bcryptjs";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";

const router = express.Router();

// ===================== CLOUDINARY SETUP =====================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ===================== MULTER + CLOUDINARY STORAGE =====================
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "student_profiles", // folder name in Cloudinary
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    public_id: (req, file) => {
      return `${req.body.usn}_profile`; // Cloudinary file name
    },
  },
});

const upload = multer({ storage });

// ===================== PROFILE SETUP =====================
router.post("/setup", upload.single("profile_picture"), async (req, res) => {
  try {
    const { usn, display_name, password, about } = req.body;

    if (!usn || !display_name || !password) {
      return res.status(400).json({ error: "USN, display_name, and password are required." });
    }

    // ✅ Check if student exists
    const studentQuery = await pool.query("SELECT * FROM students WHERE usn = $1", [usn]);
    if (studentQuery.rows.length === 0) {
      return res.status(404).json({ error: "Student record not found. Please register first." });
    }

    const student = studentQuery.rows[0];

    // ✅ Prevent setup if user is already logged in
    if (student.is_logged_in) {
      return res.status(400).json({ message: "Profile already set up. User is already logged in." });
    }

    // ✅ Hash password before saving
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Get Cloudinary file URL (if uploaded)
    const profilePictureUrl = req.file ? req.file.path : null;

    // ✅ Update student profile in DB
    const updateQuery = `
      UPDATE students
      SET display_name = $1,
          password = $2,
          about = $3,
          profile_picture_url = $4,
          is_logged_in = true
      WHERE usn = $5
      RETURNING usn, name, user_name, email, mobile, display_name, about, profile_picture_url, is_logged_in;
    `;

    const result = await pool.query(updateQuery, [
      display_name,
      hashedPassword,
      about || null,
      profilePictureUrl,
      usn,
    ]);

    return res.status(200).json({
      message: "Profile setup complete and uploaded to Cloudinary.",
      student: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Profile setup error:", error);
    return res.status(500).json({ error: "Server error during profile setup." });
  }
});

export default router;
