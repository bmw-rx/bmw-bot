/**
 * BMW LITE Website - Visitor Accounts (JSON-based, kama settings.js)
 * Hizi ni akaunti za WAGENI wa website (kufungua Features Hub + Marketplace),
 * SI akaunti za kudhibiti bot - panel.html inabaki kama ilivyo (pairing +
 * premium password), haijaguswa kabisa.
 */

const fs = require("fs-extra");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const CONFIG = require("../config");

const USERS_FILE = path.join(CONFIG.dataDir, "website-users.json");
const LOGIN_LOG_FILE = path.join(CONFIG.dataDir, "website-login-log.json");

function loadUsers() {
    try {
        fs.ensureFileSync(USERS_FILE);
        const raw = fs.readFileSync(USERS_FILE, "utf-8").trim();
        return raw ? JSON.parse(raw) : [];
    } catch (_) {
        return [];
    }
}
function saveUsers(users) {
    fs.writeJsonSync(USERS_FILE, users, { spaces: 2 });
}

function loadLoginLog() {
    try {
        fs.ensureFileSync(LOGIN_LOG_FILE);
        const raw = fs.readFileSync(LOGIN_LOG_FILE, "utf-8").trim();
        return raw ? JSON.parse(raw) : [];
    } catch (_) {
        return [];
    }
}
function saveLoginLog(log) {
    // Weka tu rekodi 200 za mwisho - hii si "database" kubwa, JSON tu.
    fs.writeJsonSync(LOGIN_LOG_FILE, log.slice(-200), { spaces: 2 });
}

function findByEmail(email) {
    return loadUsers().find((u) => u.email === email.toLowerCase().trim()) || null;
}
function findById(id) {
    return loadUsers().find((u) => u.id === id) || null;
}

async function createUser({ name, email, password }) {
    const users = loadUsers();
    const cleanEmail = email.toLowerCase().trim();
    if (users.find((u) => u.email === cleanEmail)) {
        throw new Error("Email hii tayari inatumika.");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        name: name.trim(),
        email: cleanEmail,
        passwordHash,
        createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);
    return user;
}

async function verifyPassword(user, plainPassword) {
    return bcrypt.compare(plainPassword, user.passwordHash);
}

function issueToken(user) {
    return jwt.sign({ userId: user.id, email: user.email }, CONFIG.siteJwtSecret, { expiresIn: "30d" });
}
function verifyToken(token) {
    try {
        return jwt.verify(token, CONFIG.siteJwtSecret);
    } catch (_) {
        return null;
    }
}

/**
 * FEATURE: Login Activity (device/location) - kila mtu anaona TU historia
 * yake mwenyewe ya kuingia (IP + eneo la takriban + kifaa/browser) - ni
 * "security page" ya kawaida (kama Facebook/Google 'Where you're logged in'),
 * SI ufuatiliaji wa siri wa wageni wengine.
 */
function recordLogin(userId, { ip, location, userAgent }) {
    const log = loadLoginLog();
    log.push({ userId, ip, location: location || null, userAgent: userAgent || null, at: new Date().toISOString() });
    saveLoginLog(log);
}
function getLoginHistory(userId, limit = 10) {
    return loadLoginLog()
        .filter((l) => l.userId === userId)
        .slice(-limit)
        .reverse();
}

/**
 * Express middleware - inahitaji cookie "site_session".
 */
function requireSiteAuth(req, res, next) {
    const token = req.cookies?.site_session;
    const payload = token ? verifyToken(token) : null;
    if (!payload) {
        return res.status(401).json({ ok: false, error: "Ingia kwanza kuendelea." });
    }
    req.siteUserId = payload.userId;
    req.siteUserEmail = payload.email;
    next();
}

module.exports = {
    createUser, findByEmail, findById, verifyPassword,
    issueToken, verifyToken, requireSiteAuth,
    recordLogin, getLoginHistory,
};
