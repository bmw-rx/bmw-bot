const crypto = require("crypto");
const { query } = require("./db");

function generateApiKey() {
    return "bmw_" + crypto.randomBytes(24).toString("hex");
}

async function createLicense({ label, expiresInHours, isOwner }) {
    const apiKey = generateApiKey();
    const expiresAt = isOwner ? null : new Date(Date.now() + (Number(expiresInHours) || 40) * 60 * 60 * 1000);
    const r = await query(
        "INSERT INTO license_keys (api_key, label, is_owner, expires_at) VALUES ($1,$2,$3,$4) RETURNING *",
        [apiKey, label || null, !!isOwner, expiresAt]
    );
    return r.rows[0];
}

async function listLicenses() {
    const r = await query("SELECT * FROM license_keys ORDER BY created_at DESC");
    return r.rows;
}

async function getLicenseByKey(apiKey) {
    const r = await query("SELECT * FROM license_keys WHERE api_key = $1", [apiKey]);
    return r.rows[0] || null;
}

async function revokeLicense(id) {
    await query("UPDATE license_keys SET revoked = TRUE WHERE id = $1", [id]);
}

async function recordCheckin(apiKey, ip) {
    await query(
        "UPDATE license_keys SET last_checkin_at = NOW(), last_checkin_ip = $1, checkin_count = checkin_count + 1 WHERE api_key = $2",
        [ip || null, apiKey]
    );
}

/**
 * FEATURE: One-time-use zip download. Inatumia UPDATE...WHERE zip_downloaded
 * = FALSE ikirudisha row iliyobadilishwa - hii ni "atomic": kama maombi
 * mawili yakija kwa wakati mmoja mmoja (race condition), moja tu ndilo
 * litapata row (RETURNING), la pili litapata matokeo tupu.
 */
async function markZipDownloaded(apiKey) {
    const r = await query(
        "UPDATE license_keys SET zip_downloaded = TRUE, zip_downloaded_at = NOW() WHERE api_key = $1 AND zip_downloaded = FALSE RETURNING *",
        [apiKey]
    );
    return r.rows[0] || null; // null = tayari ilishatumika (au haipo)
}

/**
 * Inarudisha { valid, reason } - hii ndiyo "chanzo cha ukweli" kimoja
 * kinachotumika na PANEL YA OWNER (list ya keys) NA endpoint ya
 * /api/license/verify (phone-home kutoka bot zilizosambazwa), kuhakikisha
 * uamuzi ni ule ule mahali pote.
 */
function evaluateLicense(license) {
    if (!license) return { valid: false, reason: "not_found" };
    if (license.revoked) return { valid: false, reason: "revoked" };
    if (license.is_owner) return { valid: true, reason: "owner" };
    if (license.expires_at && new Date(license.expires_at).getTime() < Date.now()) {
        return { valid: false, reason: "expired" };
    }
    return { valid: true, reason: "active" };
}

module.exports = { createLicense, listLicenses, getLicenseByKey, revokeLicense, recordCheckin, evaluateLicense, markZipDownloaded };
