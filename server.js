// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import profileRoutes from "./routes/profile.js";
import deleteRouter, { deleteExpiredAccounts, startDeletionScheduler } from "./routes/delete.js"; // ✅ import router too
import pool from "./db.js";
import logoutRouter from "./routes/logout.js";
import loginRouter from "./routes/login.js";


dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());
import deleteRoutes from "./routes/delete.js"; 
// ✅ Routes
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/auth/delete", deleteRouter); // ✅ mount delete route here
app.use("/api/auth", deleteRoutes);
app.use("/api/logout", logoutRouter);
app.use("/api/login", loginRouter);



// ✅ Test DB connection
pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("❌ DB connection error:", err));

// ✅ Run one immediate deletion check on startup
deleteExpiredAccounts();

// ✅ Start automatic 24h scheduler
startDeletionScheduler();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
