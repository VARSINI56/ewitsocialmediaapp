import express from "express";
import pool from "../db.js";
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
    folder: "student_profiles",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    public_id: (req, file) => `${req.body.usn}_profile`,
    overwrite: true, // ✅ ensures the old profile picture is replaced
  },
});

// ✅ This line was missing in your previous code
const upload = multer({ storage });

// ===================== PROFILE SETUP =====================
router.post("/setup", upload.single("profile_picture"), async (req, res) => {
  try {
    const { usn, about } = req.body;

    if (!usn) {
      return res.status(400).json({ error: "USN is required." });
    }

    // ✅ Check if student exists
    const studentQuery = await pool.query("SELECT * FROM students WHERE usn = $1", [usn]);
    if (studentQuery.rows.length === 0) {
      return res.status(404).json({ error: "Student record not found. Please register first." });
    }

    const student = studentQuery.rows[0];

    // ✅ Prevent setup if user is already logged in
    //if (student.is_logged_in) {
      //return res.status(400).json({ message: "Profile already set up. User is already logged in." });
    //}

    // ✅ Get Cloudinary file URL (if uploaded)
    const profilePictureUrl = req.file ? req.file.path : null;


    // ✅ Update student profile in DB
const updateQuery = `
  UPDATE students
  SET about = $1,
      profile_picture_url = $2
  WHERE usn = $3
  RETURNING usn, name, display_name, email, mobile, password, about, profile_picture_url;
`;


    const result = await pool.query(updateQuery, [
      about || null,
      profilePictureUrl,
      usn,
    ]);

    return res.status(200).json({
      message: "Profile setup complete and uploaded to Cloudinary.",
      student: result.rows[0], // no is_logged_in, user_name replaced with display_name
    });
  } catch (error) {
    console.error("❌ Profile setup error:", error);
    return res.status(500).json({ error: "Server error during profile setup." });
  }
});

export default router;
