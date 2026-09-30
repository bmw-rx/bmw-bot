const { query } = require("./db");

async function createAccount({ name, email, passwordHash }) {
    const r = await query(
        "INSERT INTO accounts (name, email, password_hash) VALUES ($1,$2,$3) RETURNING *",
        [name, email, passwordHash]
    );
    return r.rows[0];
}
async function getAccountByEmail(email) {
    const r = await query("SELECT * FROM accounts WHERE email = $1", [email]);
    return r.rows[0] || null;
}
async function getAccountById(id) {
    const r = await query("SELECT * FROM accounts WHERE id = $1", [id]);
    return r.rows[0] || null;
}

async function recordLogin(accountId, { ip, city, country, userAgent }) {
    await query(
        "INSERT INTO login_history (account_id, ip_address, city, country, user_agent) VALUES ($1,$2,$3,$4,$5)",
        [accountId, ip || null, city || null, country || null, userAgent || null]
    );
}
async function getLoginHistory(accountId, limit = 20) {
    const r = await query(
        "SELECT * FROM login_history WHERE account_id = $1 ORDER BY created_at DESC LIMIT $2",
        [accountId, limit]
    );
    return r.rows;
}

module.exports = { createAccount, getAccountByEmail, getAccountById, recordLogin, getLoginHistory };
