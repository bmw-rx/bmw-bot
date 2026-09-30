/**
 * BMW LITE - Database connection (Neon Postgres)
 * DATABASE_URL inasomwa TU kutoka Environment Variable.
 */
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL haijawekwa - accounts/login hazitafanya kazi mpaka uweke Environment Variable.");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 8,
    idleTimeoutMillis: 30000,
});

pool.on("error", (err) => console.error("Postgres pool error:", err.message));

async function query(text, params) {
    return pool.query(text, params);
}

module.exports = { pool, query };
