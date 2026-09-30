/**
 * BMW LITE - License Check (Phone-Home)
 *
 * Hii inatumika TU kwenye copy zilizosambazwa kupitia /api/bot-zip - kama
 * "license.config.json" haipo (mfano: copy ya owner mwenyewe, au hii
 * deliverable zip unayoipokea sasa), hii function inarudi mara moja bila
 * kufanya chochote (no-op kabisa, salama).
 *
 * USALAMA: Jibu la server linathibitishwa kwa Ed25519 signature (public
 * key iliyojengwa ndani ya license.config.json) - mtu HAWEZI kughushi
 * "valid: true" kwa DNS spoofing, hosts-file redirect, au fake local
 * server, kwa sababu hana PRIVATE KEY (hiyo inabaki server pekee).
 *
 * UKWELI MUHIMU: Hii haiwezi kuzuia mtu mwenye ujuzi wa kutosha kufuta
 * kabisa call hii kutoka kwenye code yake mwenyewe (ni JS ya wazi). Ni
 * kizuizi kwa watumiaji wa kawaida, si "unbeatable DRM".
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

const CONFIG_PATH = path.join(__dirname, "..", "license.config.json");
const RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // kila masaa 6 wakati bot inaendelea kukimbia

function loadLicenseConfig() {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    } catch (_) {
        return null;
    }
}

function verifySignature(payload, signatureB64, publicKeyB64) {
    try {
        const publicKey = crypto.createPublicKey({
            key: Buffer.from(publicKeyB64, "base64"),
            format: "der",
            type: "spki",
        });
        const data = Buffer.from(JSON.stringify(payload));
        return crypto.verify(null, data, publicKey, Buffer.from(signatureB64, "base64"));
    } catch (_) {
        return false;
    }
}

async function checkOnce(config) {
    const res = await axios.post(
        `${config.serverUrl}/api/license/verify`,
        { key: config.key },
        { timeout: 10000 }
    );
    const { payload, signature } = res.data || {};
    if (!payload || !signature) throw new Error("Jibu la server halikamiliki.");

    const authentic = verifySignature(payload, signature, config.publicKeyB64);
    if (!authentic) {
        // Signature haikuthibitika - hii ni ishara ya JARIBIO LA UGHUSHI
        // (fake server/MITM), si tatizo la kawaida la mtandao. Tunakataa
        // kwa usalama (fail-closed) kwenye hali hii MAALUM.
        return { valid: false, reason: "signature_invalid", spoofSuspected: true };
    }
    if (payload.key !== config.key) {
        return { valid: false, reason: "key_mismatch", spoofSuspected: true };
    }
    return { valid: payload.valid, reason: payload.reason, expiresAt: payload.expiresAt };
}

const REASON_MESSAGES_SW = {
    not_found: "API key haipo kwenye mfumo.",
    revoked: "API key hii imezuiliwa (revoked) na owner.",
    expired: "Muda wa API key hii umeisha.",
    signature_invalid: "⚠️ Jibu la license server halikuthibitika (jaribio la ughushi linashukiwa).",
    key_mismatch: "⚠️ Jibu la license server halikuendana na key iliyotumwa.",
};

/**
 * Inaitwa mara moja wakati wa boot (kabla ya kuanzisha Baileys). Ikiwa
 * license si sahihi, inaandika sababu na kusimamisha process (process.exit).
 * Ikiwa ni tatizo la mtandao tu (server haifikiki), inaruhusu bot kuendelea
 * (fail-open) - lakini itajaribu tena baadaye (checkPeriodically).
 */
async function checkAtBoot(logger) {
    const log = logger || console;
    const config = loadLicenseConfig();
    if (!config) return; // Copy ya owner - hakuna licensing, endelea kama kawaida

    try {
        const result = await checkOnce(config);
        if (!result.valid) {
            log.error(`❌ LICENSE: ${REASON_MESSAGES_SW[result.reason] || result.reason}`);
            log.error("Bot haiwezi kuanza. Wasiliana na muuzaji kwa API key mpya.");
            process.exit(1);
        }
        log.success?.(`✅ License sahihi (${result.reason}).`) || log.info(`✅ License sahihi (${result.reason}).`);
        checkPeriodically(config, log);
    } catch (err) {
        log.warn?.(`⚠️ License check imeshindwa kufikia server (${err.message}) - bot inaendelea kwa sasa.`) ||
            log.info(`⚠️ License check imeshindwa kufikia server (${err.message}) - bot inaendelea kwa sasa.`);
        checkPeriodically(config, log);
    }
}

function checkPeriodically(config, log) {
    setInterval(async () => {
        try {
            const result = await checkOnce(config);
            if (!result.valid) {
                log.error(`❌ LICENSE: ${REASON_MESSAGES_SW[result.reason] || result.reason} - bot inasimama sasa.`);
                process.exit(1);
            }
        } catch (_) {
            // Tatizo la mtandao la muda - hatuzimi bot kwa hili, jaribio
            // lijalo litafanyika baada ya RECHECK_INTERVAL_MS nyingine.
        }
    }, RECHECK_INTERVAL_MS);
}

module.exports = { checkAtBoot };
