import { Pool, PoolConfig } from "pg";
import dotenv from "dotenv";

dotenv.config();

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: process.env.DB_POOL_MAX ? Number(process.env.DB_POOL_MAX) : 20,
  idleTimeoutMillis: process.env.DB_IDLE_TIMEOUT ? Number(process.env.DB_IDLE_TIMEOUT) : 30000,
  connectionTimeoutMillis: process.env.DB_CONNECTION_TIMEOUT ? Number(process.env.DB_CONNECTION_TIMEOUT) : 5000,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
};

export const pool = new Pool(poolConfig);

pool.connect()
  .then(client => {
    console.log("✅ Connected to PostgreSQL");
    client.release();
  })
  .catch(err => {
    console.error("❌ PostgreSQL Connection Error:", err.message);
  });