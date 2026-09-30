/**
 * BMW LITE - License Signing (Ed25519)
 *
 * Muundo: Server hii ina PRIVATE KEY (haitolewi/hai-distributiwi KAMWE).
 * Kila bot iliyosambazwa (kupitia /api/bot-zip) inapewa PUBLIC KEY tu iliyo
 * salama kushirikiwa - mtu akipata public key, HAWEZI kutumia hiyo
 * kughushi majibu ya "license ni sahihi" (tofauti na HMAC ya kawaida ambapo
 * secret moja inatumika pande zote mbili).
 *
 * Weka LICENSE_PRIVATE_KEY_B64 kwenye Environment Variables. Ikiwa
 * haijawekwa, keypair mpya inatengenezwa kila boot (SIO SALAMA kwa
 * production - bot zilizosambazwa awali hazitatambua public key mpya) -
 * onyo linaandikwa kwenye logs likikutokea hivyo.
 */
const crypto = require("crypto");

let cachedKeyPair = null;

function loadOrGenerateKeyPair() {
    if (cachedKeyPair) return cachedKeyPair;

    const privB64 = process.env.LICENSE_PRIVATE_KEY_B64;
    if (privB64) {
        try {
            const privateKey = crypto.createPrivateKey({
                key: Buffer.from(privB64, "base64"),
                format: "der",
                type: "pkcs8",
            });
            const publicKey = crypto.createPublicKey(privateKey);
            cachedKeyPair = { privateKey, publicKey };
            return cachedKeyPair;
        } catch (err) {
            console.error(`❌ LICENSE_PRIVATE_KEY_B64 si sahihi (${err.message}) - natengeneza keypair ya muda.`);
        }
    }

    console.warn(
        "⚠️ LICENSE_PRIVATE_KEY_B64 haijawekwa - keypair ya muda (temporary) inatengenezwa.\n" +
        "   Hii itabadilika kila boot na bot zilizosambazwa AWALI hazitatambua public key mpya.\n" +
        "   Endesha `node lib/generateLicenseKeypair.js` MARA MOJA, weka LICENSE_PRIVATE_KEY_B64\n" +
        "   kwenye Environment Variables, kisha restart."
    );
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    cachedKeyPair = { privateKey, publicKey };
    return cachedKeyPair;
}

function getPublicKeyBase64() {
    const { publicKey } = loadOrGenerateKeyPair();
    return publicKey.export({ format: "der", type: "spki" }).toString("base64");
}

/**
 * Inasaini payload (object) - inarudisha { payload, signature } ambapo
 * signature ni base64 ya Ed25519 signature juu ya JSON.stringify(payload).
 */
function signPayload(payload) {
    const { privateKey } = loadOrGenerateKeyPair();
    const data = Buffer.from(JSON.stringify(payload));
    const signature = crypto.sign(null, data, privateKey).toString("base64");
    return { payload, signature };
}

module.exports = { loadOrGenerateKeyPair, getPublicKeyBase64, signPayload };
