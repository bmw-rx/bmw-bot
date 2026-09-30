/**
 * BMW LITE - Premium Config Manager
 * Hutunza "overrides" za mipangilio ya premium (bot image, bot song, owner
 * number, channel) kwenye data/premium-config.json ili zibaki hata bot
 * ikianzishwa upya, na huzitumia moja kwa moja juu ya CONFIG (config.js).
 *
 * Password ya premium HAIHIFADHIWI wala HAIRUDISHWI kwa client kamwe -
 * inakaguliwa upande wa server pekee (tazama dashboard.js).
 */

const fs = require("fs-extra");
const path = require("path");
const CONFIG = require("../config");

const OVERRIDES_FILE = path.join(__dirname, "..", "data", "premium-config.json");

// Funguo pekee zinazoruhusiwa kubadilishwa kupitia premium overrides -
// whitelist hii inazuia endpoint ya premium kutumika kubadilisha funguo
// zisizohusiana (mfano API keys) hata kama ombi limebadilishwa kwa mkono.
const ALLOWED_KEYS = ["botImage", "botSong", "owner", "onlineFooter", "customPairingCode"];

function loadOverrides() {
    try {
        fs.ensureFileSync(OVERRIDES_FILE);
        const raw = fs.readFileSync(OVERRIDES_FILE, "utf-8").trim();
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return typeof parsed === "object" && parsed ? parsed : {};
    } catch (_) {
        return {};
    }
}

function saveOverrides(overrides) {
    fs.writeJsonSync(OVERRIDES_FILE, overrides, { spaces: 2 });
}

/**
 * Applies any saved overrides on top of CONFIG. Called once at startup
 * (dashboard.js) so a restart doesn't lose premium changes.
 */
function applyOverrides() {
    const overrides = loadOverrides();
    for (const key of ALLOWED_KEYS) {
        if (overrides[key] !== undefined && overrides[key] !== "") {
            CONFIG[key] = overrides[key];
        }
    }
    return overrides;
}

/**
 * Sets one premium-controlled key, persists it, and applies it to CONFIG
 * immediately (no restart required).
 */
function setOverride(key, value) {
    if (!ALLOWED_KEYS.includes(key)) {
        throw new Error("Key hii haiko kwenye premium overrides zinazoruhusiwa");
    }
    const overrides = loadOverrides();
    overrides[key] = value;
    saveOverrides(overrides);
    CONFIG[key] = value;
    return value;
}

function getOverrides() {
    return loadOverrides();
}

module.exports = {
    applyOverrides,
    setOverride,
    getOverrides,
    ALLOWED_KEYS,
};
