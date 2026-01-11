// utils/mailer.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,     // your Gmail address
    pass: process.env.EMAIL_PASS,     // your Gmail app password
  },
});

/**
 * Send verification confirmation email
 */
export const sendVerificationEmail = async (email, name, usn) => {
  const confirmLink = `${process.env.FRONTEND_URL}/confirm-verification?usn=${usn}`;
  const mailOptions = {
    from: `"Student Social" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Confirm Your Verification",
    html: `
      <h2>Hello ${name},</h2>
      <p>Your verification was successful! Please confirm that it was you.</p>
      <p>
        <a href="${confirmLink}" 
           style="background:#4CAF50;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">
           Confirm Verification
        </a>
      </p>
      <p>If you didn’t attempt verification, ignore this email.</p>
    `,
  };
  await transporter.sendMail(mailOptions);
};

/**
 * Send deletion notice email
 */
export const sendDeletionEmail = async (email, name) => {
  const mailOptions = {
    from: `"Student Social" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Account Deletion Scheduled",
    html: `
      <h2>Hello ${name},</h2>
      <p>Your account has been scheduled for deletion and will be permanently deleted in 14 days.</p>
      <p>If you log in again within this period, the deletion will be automatically cancelled.</p>
      <p>We’re sorry to see you go.</p>
    `,
  };
  await transporter.sendMail(mailOptions);
};
