/**
 * Endesha MARA MOJA: node lib/generateLicenseKeypair.js
 * Weka LICENSE_PRIVATE_KEY_B64 iliyotokea kwenye Environment Variables za
 * server yako, kisha restart. USITUME/USISHIRIKI private key hii POPOTE.
 */
const crypto = require("crypto");

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

const privB64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const pubB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

console.log("\n✅ Ed25519 keypair mpya imetengenezwa.\n");
console.log("1) Weka hii kwenye Environment Variables (SIRI - usiishiriki popote):");
console.log(`   LICENSE_PRIVATE_KEY_B64=${privB64}\n`);
console.log("2) Public key hii inaweza kushirikiwa salama (inajengwa moja kwa moja");
console.log("   kwenye zip za wateja na endpoint ya /api/bot-zip, hakuna haja ya kuiweka kwa mkono):");
console.log(`   ${pubB64}\n`);
