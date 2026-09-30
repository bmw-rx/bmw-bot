const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";

async function hashPassword(plain) {
    return bcrypt.hash(plain, 10);
}
async function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}
function issueToken(account) {
    return jwt.sign({ accountId: account.id, email: account.email }, JWT_SECRET, { expiresIn: "30d" });
}
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (_) {
        return null;
    }
}

/**
 * Middleware inayolinda dashboard (panel.html) na API endpoints - inahitaji
 * cookie "account_token" iliyowekwa wakati wa login.
 */
function requireAccountAuth(req, res, next) {
    const token = req.cookies?.account_token;
    const payload = token ? verifyToken(token) : null;
    if (!payload) {
        if (req.path.endsWith(".html") || req.path === "/") {
            return res.redirect("/login.html");
        }
        return res.status(401).json({ ok: false, error: "Umetoka nje ya akaunti. Ingia tena." });
    }
    req.accountId = payload.accountId;
    req.accountEmail = payload.email;
    next();
}

module.exports = { hashPassword, verifyPassword, issueToken, verifyToken, requireAccountAuth };
