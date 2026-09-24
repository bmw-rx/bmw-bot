// Inapakia .env (ikiwa ipo) kwenye process.env - LAZIMA iwe mstari wa kwanza
// kabisa, kabla ya kitu kingine chochote kuita process.env.* (mfano config.js).
// Hosting nyingi (Wispbyte/KataBump) zina sehemu yao ya "Environment Variables"
// UI ambayo tayari inaweka hizi moja kwa moja bila kuhitaji .env - lakini
// hii inahakikisha .env pia inafanya kazi endapo umeamua kuitumia badala yake.
require("dotenv").config();

// FEATURE: License Check (Phone-Home Security) - no-op ikiwa hii ni copy ya
// owner (hakuna license.config.json). Kwenye copy zilizosambazwa, inazuia
// bot isianze kama API key si sahihi/imeisha muda/imezuiliwa.
require("./lib/licenseCheck").checkAtBoot(console);

/**
 * BMW LITE - Web Dashboard
 * Express server providing:
 *  - Form to enter phone number and get Pairing Code directly in browser
 *  - Bot status (connected/disconnected)
 *  - Toggles to enable/disable auto features
 *  - Connected devices list
 *
 * Usage: npm run dashboard   or   node dashboard.js
 * Then open http://localhost:3000 in your browser (on Termux device or phone)
 */

const express = require("express");
const path = require("path");
const os = require("os");
const fs = require("fs-extra");
const archiver = require("archiver");
const AdmZip = require("adm-zip");
const multer = require("multer");
const cookieParser = require("cookie-parser");

const CONFIG = require("./config");
const logger = require("./lib/logger");
const botManager = require("./lib/botManager");
const sessionManager = require("./lib/sessionManager");
const settingsManager = require("./lib/settings");
const updater = require("./lib/updater");
const premiumConfig = require("./lib/premiumConfig");
const accountStore = require("./lib/accountStore");
const accountAuth = require("./lib/accountAuth");
const mailer = require("./lib/mailer");
const geoip = require("./lib/geoip");

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

/* ---------------- ACCOUNTS (Create Account / Login) ---------------- */
// FEATURE: panel.html haitolewi tena moja kwa moja na express.static (ilitolewa
// kwenye "private/" badala ya "public/") - inahitaji login kwanza.

function getClientIp(req) {
    const fwd = req.headers["x-forwarded-for"];
    return (fwd ? fwd.split(",")[0].trim() : req.socket.remoteAddress || "").replace("::ffff:", "");
}

app.post("/api/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body || {};
        if (!name || !email || !password || password.length < 6) {
            return res.status(400).json({ ok: false, error: "Jaza jina, email, na password (herufi 6+)." });
        }
        const existing = await accountStore.getAccountByEmail(email.toLowerCase().trim());
        if (existing) {
            return res.status(400).json({ ok: false, error: "Email hii tayari inatumika." });
        }
        const passwordHash = await accountAuth.hashPassword(password);
        const account = await accountStore.createAccount({ name: name.trim(), email: email.toLowerCase().trim(), passwordHash });

        // Welcome email - "best effort", haizuii signup kama SMTP haijawekwa
        mailer.sendWelcomeEmail(account.email, account.name).catch(() => {});

        // Record kwenye login_history (device/location) - akaunti mpya = login ya kwanza
        const ip = getClientIp(req);
        geoip.lookupIp(ip).then((loc) => {
            accountStore.recordLogin(account.id, { ip, city: loc.city, country: loc.country, userAgent: req.headers["user-agent"] }).catch(() => {});
        });

        const token = accountAuth.issueToken(account);
        res.cookie("account_token", token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: "lax" });
        res.json({ ok: true, account: { id: account.id, name: account.name, email: account.email } });
    } catch (err) {
        logger.error(`Signup error: ${err.message}`);
        res.status(500).json({ ok: false, error: "Imeshindikana kuunda akaunti. Jaribu tena." });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const account = await accountStore.getAccountByEmail((email || "").toLowerCase().trim());
        if (!account) return res.status(401).json({ ok: false, error: "Email au password si sahihi." });

        const valid = await accountAuth.verifyPassword(password || "", account.password_hash);
        if (!valid) return res.status(401).json({ ok: false, error: "Email au password si sahihi." });

        // FEATURE: Device & Location - kumbukumbu ya login (akaunti kuona historia yake)
        const ip = getClientIp(req);
        geoip.lookupIp(ip).then((loc) => {
            accountStore.recordLogin(account.id, { ip, city: loc.city, country: loc.country, userAgent: req.headers["user-agent"] }).catch(() => {});
        });

        const token = accountAuth.issueToken(account);
        res.cookie("account_token", token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: "lax" });
        res.json({ ok: true, account: { id: account.id, name: account.name, email: account.email } });
    } catch (err) {
        logger.error(`Login error: ${err.message}`);
        res.status(500).json({ ok: false, error: "Imeshindikana kuingia. Jaribu tena." });
    }
});

app.post("/api/logout", (req, res) => {
    res.clearCookie("account_token");
    res.json({ ok: true });
});

app.get("/api/account/me", accountAuth.requireAccountAuth, async (req, res) => {
    const account = await accountStore.getAccountById(req.accountId);
    if (!account) return res.status(404).json({ ok: false });
    res.json({ ok: true, account: { id: account.id, name: account.name, email: account.email } });
});

// FEATURE: Device & Location - historia ya login (kama "Security/Recent Activity")
app.get("/api/account/login-history", accountAuth.requireAccountAuth, async (req, res) => {
    const history = await accountStore.getLoginHistory(req.accountId, 20);
    res.json({ ok: true, history });
});

// Panel.html (dashboard ya kudhibiti bot) - imelindwa, inahitaji login
app.get("/panel.html", accountAuth.requireAccountAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "private", "panel.html"));
});

/* ---------------- LICENSING: Phone-Home Verify + Bot Zip Download ---------------- */
// HIZI NI ROUTES ZA UMMA (public) KWA MAKUSUDI - bot zilizosambazwa
// zinazipiga bila login ya account (zinatumia API key yao wenyewe kama
// credential). Zimewekwa KABLA ya app.use("/api", requireAccountAuth) hapa
// chini ili zisizuiliwe na hiyo middleware.

const licenseStore = require("./lib/licenseStore");
const licenseCrypto = require("./lib/licenseCrypto");

function getClientIpForLicense(req) {
    const fwd = req.headers["x-forwarded-for"];
    return (fwd ? fwd.split(",")[0].trim() : req.socket.remoteAddress || "").replace("::ffff:", "");
}

// FEATURE: Phone-Home Security Check - bot zilizosambazwa zinapiga hii kila
// zinapoanza (na mara kwa mara zikiwa zinaendelea kukimbia) kuthibitisha
// license bado ni sahihi. Jibu linasainiwa na Ed25519 PRIVATE KEY (hapa
// server pekee) - bot inathibitisha signature kwa PUBLIC KEY iliyojengwa
// ndani yake, hivyo mtu hawezi kughushi "valid: true" kwa kuvizia mtandao
// (DNS spoofing/MITM/fake server ya local) bila private key hii.
app.post("/api/license/verify", async (req, res) => {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ ok: false, error: "Missing key" });

    const license = await licenseStore.getLicenseByKey(key).catch(() => null);
    const result = licenseStore.evaluateLicense(license);

    if (result.valid) {
        licenseStore.recordCheckin(key, getClientIpForLicense(req)).catch(() => {});
    }

    const signed = licenseCrypto.signPayload({
        key,
        valid: result.valid,
        reason: result.reason,
        expiresAt: license?.expires_at || null,
        checkedAt: new Date().toISOString(),
    });
    res.json({ ok: true, ...signed });
});

// FEATURE: "BMW Bot Zip" - inatengeneza zip mpya (bila node_modules/data/session)
// ikiwa na license key + public key + server URL zilizojengwa ndani, kwa
// wakati halisi (on-the-fly), kama key iliyotolewa ipo na bado ni sahihi.
app.get("/api/bot-zip", async (req, res) => {
    const key = req.query.key;
    if (!key) return res.status(400).json({ ok: false, error: "Missing ?key=" });

    const license = await licenseStore.getLicenseByKey(key).catch(() => null);
    const result = licenseStore.evaluateLicense(license);
    if (!result.valid) {
        return res.status(403).json({ ok: false, error: `License si sahihi (${result.reason}).` });
    }

    // FEATURE: One-time-use zip download - kila key ya mteja (si owner)
    // inaweza kupakua zip MARA MOJA TU. Owner keys (is_owner=true) hazina
    // kikomo hiki, kwa ajili ya testing/dev ya mara kwa mara.
    if (!license.is_owner) {
        const marked = await licenseStore.markZipDownloaded(key).catch(() => null);
        if (!marked) {
            return res.status(403).json({ ok: false, error: "Link hii ya download tayari imetumika. Wasiliana na muuzaji kwa link mpya." });
        }
    }

    try {
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="bmw-lite-licensed-${key.slice(-8)}.zip"`);

        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.on("error", (err) => {
            logger.error(`Bot-zip generation error: ${err.message}`);
            if (!res.headersSent) res.status(500).end();
        });
        archive.pipe(res);

        // Faili zote za project, isipokuwa hizi (data/session ya owner pekee,
        // si sehemu ya "source code" inayohitajika na mteja).
        const EXCLUDE = new Set(["node_modules", "data", "session", "sessions", "temp", ".git", "uploads", ".env"]);
        for (const entry of fs.readdirSync(__dirname)) {
            if (EXCLUDE.has(entry)) continue;
            const full = path.join(__dirname, entry);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) {
                archive.directory(full, entry);
            } else {
                archive.file(full, { name: entry });
            }
        }

        // Weka license config (key + public key + server URL) - hii ndiyo
        // inayowezesha lib/licenseCheck.js kufanya kazi kwenye copy hii.
        const serverUrl = `${req.protocol}://${req.get("host")}`;
        const licenseConfig = {
            key,
            serverUrl,
            publicKeyB64: licenseCrypto.getPublicKeyBase64(),
        };
        archive.append(JSON.stringify(licenseConfig, null, 2), { name: "license.config.json" });

        await archive.finalize();
    } catch (err) {
        logger.error(`Bot-zip error: ${err.message}`);
        if (!res.headersSent) res.status(500).json({ ok: false, error: err.message });
    }
});

// Kila kitu kingine chenye /api/* (pairing, premium, stats, n.k.) - kinahitaji
// login pia - middleware hii inawekwa BAADA ya routes za signup/login/logout
// zilizo hapo juu, kwa hivyo hazizuiliwi.
app.use("/api", accountAuth.requireAccountAuth);

/* ---------------- LICENSING: Owner-only key management ---------------- */
app.post("/api/licenses", async (req, res) => {
    const { label, expiresInHours, isOwner } = req.body || {};
    const license = await licenseStore.createLicense({ label, expiresInHours, isOwner });
    res.json({ ok: true, license });
});

app.get("/api/licenses", async (req, res) => {
    res.json({ ok: true, licenses: await licenseStore.listLicenses() });
});

app.delete("/api/licenses/:id", async (req, res) => {
    await licenseStore.revokeLicense(Number(req.params.id));
    res.json({ ok: true });
});

let botStarted = false;

// Apply any premium overrides saved from previous sessions (bot image, bot
// song, owner number, channel) so they survive a restart.
premiumConfig.applyOverrides();

/* ---------------- PREMIUM FEATURES (password protected) ---------------- */
// Password ya kufungua premium features - USIWEKE hii kwenye HTML/JS ya
// public/ wala usiirudishe kwa client - inakaguliwa hapa server-side pekee.
// Badilishwa kwa Environment Variable PREMIUM_PASSWORD ukitaka kuibadilisha
// bila kuhariri code.
const PREMIUM_PASSWORD = process.env.PREMIUM_PASSWORD || "3006";

function requirePremiumPassword(req, res, next) {
    const { password } = req.body || {};
    if (password !== PREMIUM_PASSWORD) {
        // Ujumbe wa jumla tu - hauashirii kama namba/thamani nyingine za ombi
        // ni sahihi, ili kuepuka kutoa vidokezo kwa mtu anayejaribu bahati nasibu.
        return res.status(401).json({ ok: false, error: "Password si sahihi." });
    }
    next();
}

// Verify password only (used by frontend to "unlock" the premium section
// before showing the controls, without exposing the password itself).
app.post("/api/premium/verify", requirePremiumPassword, (req, res) => {
    res.json({ ok: true });
});

// Change bot image (used in .menu / online message / etc.)
app.post("/api/premium/bot-image", requirePremiumPassword, (req, res) => {
    const url = String((req.body && req.body.url) || "").trim();
    if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ ok: false, error: "Weka URL sahihi (ianze na http:// au https://)" });
    }
    premiumConfig.setOverride("botImage", url);
    res.json({ ok: true, botImage: url });
});

// Change bot song (used in .menu audio, etc.)
app.post("/api/premium/bot-song", requirePremiumPassword, (req, res) => {
    const url = String((req.body && req.body.url) || "").trim();
    if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ ok: false, error: "Weka URL sahihi (ianze na http:// au https://)" });
    }
    premiumConfig.setOverride("botSong", url);
    res.json({ ok: true, botSong: url });
});

// Change owner number (controls .owner-only commands, .autoreact, etc.)
app.post("/api/premium/owner-number", requirePremiumPassword, (req, res) => {
    const cleaned = String((req.body && req.body.number) || "").replace(/[^0-9]/g, "");
    if (!cleaned || cleaned.length < 9) {
        return res.status(400).json({ ok: false, error: "Weka namba sahihi yenye country code (mfano: 255743383943)" });
    }
    premiumConfig.setOverride("owner", cleaned);
    res.json({ ok: true, owner: cleaned });
});

// Extra premium feature: custom footer/caption shown at the bottom of the
// "Bot is Online" message and .menu (replaces "Powered by Baileys" text).
app.post("/api/premium/online-footer", requirePremiumPassword, (req, res) => {
    const text = String((req.body && req.body.text) || "").trim();
    if (!text || text.length > 120) {
        return res.status(400).json({ ok: false, error: "Weka maandishi (max herufi 120)" });
    }
    premiumConfig.setOverride("onlineFooter", text);
    res.json({ ok: true, onlineFooter: text });
});

// Custom branded pairing code (mfano "BMWLITE1") - LAZIMA iwe herufi/namba 8
// kwa jumla (WhatsApp requirement), uppercase, bila alama.
app.post("/api/premium/pairing-code", requirePremiumPassword, (req, res) => {
    const raw = String((req.body && req.body.code) || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (raw.length !== 8) {
        return res.status(400).json({ ok: false, error: "Code lazima iwe herufi/namba 8 kwa jumla (mfano: BMWLITE1)." });
    }
    premiumConfig.setOverride("customPairingCode", raw);
    res.json({ ok: true, customPairingCode: raw });
});

// Extra premium feature: force logout / reset session remotely from the
// dashboard (destructive, hence password-gated).
app.post("/api/premium/logout", requirePremiumPassword, async (req, res) => {
    try {
        await botManager.logout();
        res.json({ ok: true, message: "Bot imetolewa (logged out). Pair tena kuunganisha upya." });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// ---- FEATURE 6: Command Toggle Panel ----
// Rudisha orodha ya commands zilizozimwa kwa sasa.
app.get("/api/premium/disabled-commands", (req, res) => {
    res.json({ ok: true, disabledCommands: settingsManager.getSettings().disabledCommands || [] });
});

// Weka orodha kamili mpya ya commands zilizozimwa (comma-separated kutoka frontend).
app.post("/api/premium/disabled-commands", requirePremiumPassword, (req, res) => {
    const raw = (req.body && req.body.commands) || "";
    const list = String(raw)
        .split(",")
        .map((c) => c.trim().toLowerCase().replace(/^\./, ""))
        .filter(Boolean);
    settingsManager.setSetting("disabledCommands", list);
    res.json({ ok: true, disabledCommands: list });
});

// ---- FEATURE 7: Live Logs Viewer ----
// Tunatumia POST (sio GET+query) ili password isije kubaki kwenye
// access logs za server kama sehemu ya URL.
app.post("/api/premium/logs", requirePremiumPassword, (req, res) => {
    const since = (req.body && req.body.since) ? Number(req.body.since) : null;
    res.json({ ok: true, logs: logger.getRecentLogs(since), now: Date.now() });
});

// ---- FEATURE 9: Custom Welcome/Goodbye (default template) ----
app.post("/api/premium/welcome-goodbye", requirePremiumPassword, (req, res) => {
    const welcomeMsg = String((req.body && req.body.welcomeMsg) || "").trim();
    const goodbyeMsg = String((req.body && req.body.goodbyeMsg) || "").trim();
    if (!welcomeMsg && !goodbyeMsg) {
        return res.status(400).json({ ok: false, error: "Weka angalau ujumbe mmoja (welcome au goodbye)." });
    }
    if (welcomeMsg) settingsManager.setSetting("defaultWelcomeMsg", welcomeMsg);
    if (goodbyeMsg) settingsManager.setSetting("defaultGoodbyeMsg", goodbyeMsg);
    res.json({ ok: true, defaultWelcomeMsg: settingsManager.getSettings().defaultWelcomeMsg, defaultGoodbyeMsg: settingsManager.getSettings().defaultGoodbyeMsg });
});

// ---- FEATURE 12: AI Personality Editor ----
app.post("/api/premium/ai-personality", requirePremiumPassword, (req, res) => {
    const prompt = String((req.body && req.body.prompt) || "").trim();
    if (!prompt || prompt.length > 2000) {
        return res.status(400).json({ ok: false, error: "Weka system prompt (max herufi 2000)." });
    }
    settingsManager.setSetting("aiSystemPrompt", prompt);
    res.json({ ok: true, aiSystemPrompt: prompt });
});

// ---- BONUS FEATURE: Command Cooldown / Rate Limiter ----
app.get("/api/premium/cooldowns", (req, res) => {
    res.json({ ok: true, commandCooldowns: settingsManager.getSettings().commandCooldowns || {} });
});

app.post("/api/premium/cooldowns", requirePremiumPassword, (req, res) => {
    const command = String((req.body && req.body.command) || "").trim().toLowerCase().replace(/^\./, "");
    const seconds = Number((req.body && req.body.seconds) || 0);
    if (!command || !Number.isFinite(seconds) || seconds < 0) {
        return res.status(400).json({ ok: false, error: "Weka jina la command na sekunde sahihi." });
    }
    const current = settingsManager.getSettings().commandCooldowns || {};
    if (seconds === 0) {
        delete current[command];
    } else {
        current[command] = seconds;
    }
    settingsManager.setSetting("commandCooldowns", current);
    res.json({ ok: true, commandCooldowns: current });
});

// ---- FEATURE 17: Backup & Restore Session ----
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Password inatumwa kwa POST body hapa (sio query) ili isibaki kwenye
// browser history/server logs kama query string ingelivyokuwa.
app.post("/api/premium/backup-session", requirePremiumPassword, async (req, res) => {
    try {
        const sessionDir = path.resolve(CONFIG.sessionDir);
        if (!(await fs.pathExists(sessionDir))) {
            return res.status(404).json({ ok: false, error: "Session folder haipo." });
        }
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="bmw-session-backup-${Date.now()}.zip"`);

        const archive = archiver("zip", { zlib: { level: 9 } });
        archive.on("error", (err) => {
            logger.error(`Backup session error: ${err.message}`);
            if (!res.headersSent) res.status(500).end();
        });
        archive.pipe(res);
        archive.directory(sessionDir, false);
        await archive.finalize();
    } catch (err) {
        logger.error(`Backup session error: ${err.message}`);
        if (!res.headersSent) res.status(500).json({ ok: false, error: err.message });
    }
});

// Restore inahitaji password ITUMWE kama field ya form-data (multer inaisoma
// kutoka req.body baada ya upload.single kupitisha multipart form).
app.post("/api/premium/restore-session", upload.single("sessionZip"), (req, res) => {
    if (!req.body || req.body.password !== PREMIUM_PASSWORD) {
        return res.status(401).json({ ok: false, error: "Password si sahihi." });
    }
    if (!req.file) {
        return res.status(400).json({ ok: false, error: "Weka faili la .zip la session backup." });
    }
    try {
        const sessionDir = path.resolve(CONFIG.sessionDir);
        fs.emptyDirSync(sessionDir);
        const zip = new AdmZip(req.file.buffer);
        zip.extractAllTo(sessionDir, true);
        res.json({ ok: true, message: "Session imerudishwa (restored). Restart bot ili itumike." });
    } catch (err) {
        logger.error(`Restore session error: ${err.message}`);
        res.status(500).json({ ok: false, error: "Faili la zip si sahihi au limeharibika." });
    }
});

/* ---------------- API ROUTES ---------------- */

// Get current bot status
app.get("/api/status", (req, res) => {
    res.json({
        ok: true,
        botName: CONFIG.botName,
        version: CONFIG.version,
        botStarted,
        ownerNumber: CONFIG.owner.replace(/[^0-9]/g, ""),
        ...botManager.getState(),
        settings: settingsManager.getSettings(),
    });
});

// Live system stats - CPU %, RAM usage, process/system uptime
app.get("/api/system-stats", async (req, res) => {
    try {
        // Pima matumizi ya CPU ya process hii pekee kwa kuchukua sample mara
        // mbili (kabla na baada ya delay fupi) - process.cpuUsage() inarudisha
        // microseconds tangu process ilipoanza, hivyo tunatoa tofauti.
        const startUsage = process.cpuUsage();
        const startTimeMs = Date.now();
        await new Promise((r) => setTimeout(r, 150));
        const elapsedUsage = process.cpuUsage(startUsage);
        const elapsedMs = Date.now() - startTimeMs;

        const cpuCores = os.cpus().length || 1;
        // (user+system microseconds) / (elapsed ms * 1000 microseconds/ms * cores) * 100
        const cpuPercent = ((elapsedUsage.user + elapsedUsage.system) / 1000 / elapsedMs / cpuCores) * 100;

        const mem = process.memoryUsage();
        const totalMemBytes = os.totalmem();
        const freeMemBytes = os.freemem();

        res.json({
            ok: true,
            cpu: {
                percent: Math.min(100, Math.max(0, Number(cpuPercent.toFixed(1)))),
                cores: cpuCores,
                loadAvg: os.loadavg(), // [1min, 5min, 15min] - Linux/Mac only, [0,0,0] on Windows
            },
            memory: {
                processRssBytes: mem.rss,
                processHeapUsedBytes: mem.heapUsed,
                systemTotalBytes: totalMemBytes,
                systemFreeBytes: freeMemBytes,
                systemUsedBytes: totalMemBytes - freeMemBytes,
            },
            uptime: {
                processSeconds: Math.floor(process.uptime()),
                systemSeconds: Math.floor(os.uptime()),
            },
            platform: {
                nodeVersion: process.version,
                os: `${os.type()} ${os.release()}`,
            },
        });
    } catch (err) {
        logger.error(`/api/system-stats error: ${err.message}`);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Check for updates from GitHub (does not apply them)
app.get("/api/update/check", async (req, res) => {
    try {
        const info = await updater.checkForUpdates();
        res.json({ ok: true, ...info });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Pull latest code from GitHub and install dependencies
app.post("/api/update", async (req, res) => {
    try {
        const result = await updater.performUpdate();
        res.json({
            ok: true,
            message: "Update complete. Restart the bot to apply changes.",
            ...result,
        });
    } catch (err) {
        logger.error(`Dashboard update error: ${err.message}`);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Start bot and request pairing code for phone number from form
app.post("/api/pair", async (req, res) => {
    try {
        const { phoneNumber, customCode } = req.body;
        const cleaned = (phoneNumber || "").replace(/[^0-9]/g, "");

        // Custom pairing code ya HIARI ya mtumiaji mwenyewe (mfano jina lake) -
        // LAZIMA iwe herufi/namba 8 kwa jumla (WhatsApp requirement). Ikiwa
        // haijatolewa au si sahihi, tunaacha bila ya kubadilisha chochote -
        // startBot() itarudi kwenye CONFIG.customPairingCode (branding
        // chaguo-msingi) au code ya nasibu.
        let cleanedCustomCode = null;
        if (customCode) {
            const raw = String(customCode).toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (raw.length !== 8) {
                return res.status(400).json({ ok: false, error: "Custom pairing code lazima iwe herufi/namba 8 kwa jumla." });
            }
            cleanedCustomCode = raw;
        }

        if (!cleaned || cleaned.length < 9) {
            return res.status(400).json({ ok: false, error: "Enter a valid phone number with country code (example: 255743383943)" });
        }

        const isOwnerNumber = cleaned === CONFIG.owner.replace(/[^0-9]/g, "");

        // ---- Owner's own number: pair the main bot (singleton instance) ----
        if (isOwnerNumber) {
            const currentState = botManager.getState();
            // Only (re)trigger a pairing request if we're not already connected
            // or already mid-pairing - avoids getting permanently stuck if this
            // endpoint is called more than once.
            if (currentState.status !== "connected" && currentState.status !== "waiting_for_code") {
                botStarted = true;
                botManager.startBot(cleaned, cleanedCustomCode).catch((err) => {
                    logger.error(`Bot start error: ${err.message}`);
                });
            }
            return res.json({ ok: true, message: "Requesting pairing code for the main bot... check the dashboard in a few seconds." });
        }

        // ---- Any other number: open to everyone - creates their own isolated
        // multi-session bot instance (same system used by ".pairme"). This is
        // capped by sessionManager's MAX_SESSIONS limit, so it can't be abused
        // to spin up unlimited sessions.
        const result = await sessionManager.createSession(cleaned, cleanedCustomCode);
        if (!result.ok) {
            return res.status(409).json({ ok: false, error: result.error });
        }
        if (!result.code) {
            return res.json({ ok: true, message: result.note || "Session started, but the code is taking a bit longer - refresh in a few seconds." });
        }

        return res.json({ ok: true, code: result.code, session: true, number: cleaned });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Live status of a specific whitelisted multi-session number (for polling
// after a session-based pairing request from /api/pair).
app.get("/api/session-status/:number", (req, res) => {
    const number = (req.params.number || "").replace(/[^0-9]/g, "");
    const state = sessionManager.getSessionState(number);
    if (!state) {
        return res.status(404).json({ ok: false, error: "No active session for this number." });
    }
    res.json({ ok: true, ...state });
});

// Enable/disable auto features via dashboard (boolean toggles)
app.post("/api/settings/:key", (req, res) => {
    const { key } = req.params;
    const { value } = req.body;

    const booleanKeys = ["autoStatusView", "autoTyping", "autoReactStatus", "autoReactMessages", "antiLink", "antiDelete", "autoRead", "chatbotMode"];
    const stringKeys = ["prefix", "botName", "mode"];

    if (booleanKeys.includes(key)) {
        settingsManager.setSetting(key, !!value);
        return res.json({ ok: true, key, value: !!value });
    }

    if (stringKeys.includes(key)) {
        const trimmed = String(value || "").trim();
        if (!trimmed) {
            return res.status(400).json({ ok: false, error: "Value cannot be empty" });
        }
        if (key === "prefix" && trimmed.length > 3) {
            return res.status(400).json({ ok: false, error: "Prefix must be 1-3 characters only" });
        }
        if (key === "mode" && trimmed !== "private" && trimmed !== "public") {
            return res.status(400).json({ ok: false, error: "Mode must be 'private' or 'public'" });
        }
        settingsManager.setSetting(key, trimmed);
        return res.json({ ok: true, key, value: trimmed });
    }

    return res.status(400).json({ ok: false, error: "Unknown setting" });
});

// Get list of connected devices/phones
app.get("/api/devices", async (req, res) => {
    try {
        const sock = botManager.getSock();
        if (!sock) return res.json({ ok: true, devices: [] });

        const devices = [];
        const mainPhone = sock?.user?.id?.split(":")[0] || "";
        
        // Add main device
        if (mainPhone) {
            devices.push({
                phone: mainPhone,
                connected: true,
                type: "main"
            });
        }

        // TODO: Add linked devices from sock if available
        // Future: Get linked devices list from Baileys connection state

        res.json({ ok: true, devices });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Get list of groups that bot is in, with their settings
app.get("/api/groups", async (req, res) => {
    try {
        const sock = botManager.getSock();
        if (!sock) return res.json({ ok: true, groups: [] });

        const allGroups = await sock.groupFetchAllParticipating();
        const groups = Object.values(allGroups).map((g) => {
            const gs = settingsManager.getGroupSettings(g.id);
            return {
                id: g.id,
                name: g.subject,
                participants: g.participants?.length || 0,
                welcome: gs.welcome,
                goodbye: gs.goodbye,
                antiLink: settingsManager.isGroupAntiLinkOn(g.id),
            };
        });

        res.json({ ok: true, groups });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

// Badilisha setting ya group fulani (welcome/goodbye/antiLink) kupitia dashboard
app.post("/api/groups/:groupId/:key", (req, res) => {
    try {
        const { groupId, key } = req.params;
        const { value } = req.body;

        if (key === "antiLink") {
            settingsManager.setGroupAntiLink(groupId, !!value);
            return res.json({ ok: true, key, value: !!value });
        }

        if (key === "welcome" || key === "goodbye") {
            settingsManager.setGroupSetting(groupId, key, !!value);
            return res.json({ ok: true, key, value: !!value });
        }

        return res.status(400).json({ ok: false, error: "Setting hii haijulikani" });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});

/* ---------------- START SERVER ---------------- */
// Bila hii, kosa lolote lisilokamatwa (uncaught exception/rejection)
// mahali popote kwenye process (hata nje ya route handler moja moja) lingeweza
// kuua dashboard server MZIMA - hii ndio sababu kuu ya "Unexpected end of
// JSON input" upande wa browser: connection inavunjika ghafla katikati ya
// jibu. Tunakamata hizi kimya kimya (logger tu) ili server iendelee kukaa
// hai na kuendelea kujibu requests nyingine.
process.on("uncaughtException", (err) => {
    logger.error(`[Dashboard] Uncaught Exception: ${err.message}`);
});

process.on("unhandledRejection", (err) => {
    logger.error(`[Dashboard] Unhandled Rejection: ${err?.message || err}`);
});

// Bind to 0.0.0.0 so the dashboard is reachable on hosting panels (Katabump/Pterodactyl),
// not just localhost. The host assigns the port via SERVER_PORT (see config.webPort).
app.listen(CONFIG.webPort, "0.0.0.0", () => {
    logger.success(`🌐 Dashboard running on port ${CONFIG.webPort}`);
    logger.info(`Open your panel/server URL in a browser to start pairing.`);
    logger.info(`If you already have a session connected, bot will start automatically.`);

    // Accounts table inahitajika kabla ya signup/login kufanya kazi - hii
    // inaijenga kiotomatiki ikiwa haipo (salama kuendesha mara nyingi).
    const { pool } = require("./lib/db");
    const migrationSql = require("fs").readFileSync(path.join(__dirname, "lib", "schema.sql"), "utf-8");
    pool.query(migrationSql)
        .then(() => logger.success("✅ Accounts migration imekamilika."))
        .catch((err) => logger.error(`❌ Accounts migration imeshindwa: ${err.message}`));

    // If session already exists (previously paired), start bot directly
    // without needing a new phone number. If no session, wait for user to enter
    // phone number via dashboard (using /api/pair).
    const credsPath = path.join(CONFIG.sessionDir, "creds.json");

    if (fs.existsSync(credsPath) && !botStarted) {
        botStarted = true;
        botManager.startBot(CONFIG.pairingNumber).catch((err) => {
            logger.error(`Bot auto-start error: ${err.message}`);
            botStarted = false;
        });
    }
});
