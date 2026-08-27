import pkg from "pg";
const { Pool } = pkg;

const database = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" || process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

database.on("error", (err) => {
  console.error("Unexpected database error:", err.message);
});

database.query("SELECT NOW()")
  .then(() => {
    console.log("Database Connected and Active successfully");
  })
  .catch((err) => {
    console.error("Initial connection failed:", err.message);
  });

export default database;