// db.js
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// Create pool
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD || "",
  port: Number(process.env.DB_PORT) || 5432,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test connection immediately
(async () => {
  try {
    const client = await pool.connect();
    console.log("✅ PostgreSQL connected successfully");
    client.release();
  } catch (err) {
    console.error("❌ PostgreSQL connection error:", err.message);
    console.error("Check your .env DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME, DB_SSL values!");
  }
})();

export default pool;
