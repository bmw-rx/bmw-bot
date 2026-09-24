/**
 * BMW LITE - Reset Session Script
 * Hufuta session yote ya WhatsApp (auth credentials) ili uweze
 * kupair namba mpya au kuanzisha upya kabisa.
 *
 * Matumizi: npm run reset-session   au   node reset-session.js
 */

const fs = require("fs-extra");
const path = require("path");
const readline = require("readline");

const SESSION_DIR = path.join(__dirname, "session");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function resetSession() {
    console.log("⚠️  Hii itafuta session yote ya WhatsApp (utahitaji ku-pair tena).");
    const answer = await question("Una uhakika unataka kuendelea? (yes/no): ");

    if (answer.trim().toLowerCase() !== "yes") {
        console.log("❎ Operesheni imesitishwa.");
        rl.close();
        return;
    }

    try {
        if (await fs.pathExists(SESSION_DIR)) {
            await fs.remove(SESSION_DIR);
            console.log("✅ Session imefutwa kikamilifu.");
        } else {
            console.log("ℹ️ Hakuna session iliyokuwepo.");
        }

        await fs.ensureDir(SESSION_DIR);
        console.log("📁 Folder mpya ya session imeundwa.");
        console.log("🎉 Sasa unaweza kuanzisha bot upya kwa: npm start");
    } catch (err) {
        console.error("❌ Hitilafu wakati wa kufuta session:", err.message);
    } finally {
        rl.close();
    }
}

resetSession();
