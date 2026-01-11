// utils/generateOtp.js

/**
 * Generates a random 6-digit OTP and its expiry time (default 5 minutes).
 * No external services or costs — purely local and free.
 */
export const generateOtp = (expiryMinutes = 5) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Expiry set to <current time + expiryMinutes>
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  return { otp, expiresAt };
};
