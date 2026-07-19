require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

// Optional: test Neon connection when server starts
pool.query("SELECT NOW()")
    .then((result) => {
        console.log("Connected to Neon PostgreSQL");
        console.log("Database time:", result.rows[0].now);
    })
    .catch((error) => {
        console.error(
            "Neon connection failed:",
            error.message
        );
    });

module.exports = pool;