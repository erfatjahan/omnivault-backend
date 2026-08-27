import pkg from "pg";
const { Pool } = pkg;

const database = new Pool({
  user: "postgres",
  host: "localhost",
  database: "E_commerce",
  password: "1234",
  port: 5433,
  max: 20,
  idleTimeoutMillis: 0,
});

database.on("error", (err) => {
  console.error(" Unexpected database error:", err.message);
});

database.query("SELECT NOW()")
  .then(() => {
    console.log("Database Connected and Active");
  })
  .catch((err) => {
    console.error(" Initial connection failed:", err.message);
  });

export default database;