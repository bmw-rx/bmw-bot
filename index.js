require("dotenv").config();

// FEATURE: License Check (Phone-Home Security) - no-op ikiwa hii ni copy ya
// owner (hakuna license.config.json).
require("./lib/licenseCheck").checkAtBoot(console);

/**
 * BMW LITE - WhatsApp Bot (CLI Mode)
 * This file starts the bot directly in the terminal (without dashboard).
 *
 * For web dashboard (pairing via browser), use:
 *   npm run dashboard
 *
 * Usage (CLI mode):
 *   npm install
 *   npm start
 *
 * The bot will ask for your WhatsApp phone number (e.g., 255655254973) then
 * provide a Pairing Code to enter in WhatsApp > Linked Devices > Link with phone number.
 */

const readline = require("readline");
const fs = require("fs-extra");
const path = require("path");
const CONFIG = require("./config");
const logger = require("./lib/logger");
const botManager = require("./lib/botManager");

async function main() {
    let phoneNumber = (CONFIG.pairingNumber || "").replace(/[^0-9]/g, "");

    // Ikiwa session tayari ipo (imewahi kupair), namba mpya haihitajiki kabisa.
    const credsPath = path.join(CONFIG.sessionDir, "creds.json");
    const hasSession = fs.existsSync(credsPath);

    if (!phoneNumber && !hasSession) {
        if (process.stdin.isTTY) {
            // Terminal halisi (mfano Termux) - uliza kama awali
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            const question = (text) => new Promise((resolve) => rl.question(text, resolve));

            const answer = await question(
                "📱 Enter your WhatsApp number with country code (example 255655254973): "
            );
            rl.close();
            phoneNumber = answer.replace(/[^0-9]/g, "");
        } else {
            // Console ya panel (Katabump/Pterodactyl) - hakuna TTY, hivyo readline
            // itakwama bila kupokea jibu na process huwa "inakwama"/inaonekana crashed.
            // Badala ya kusubiri milele, toa ujumbe wazi na usimamishe process (exit code 0
            // husababisha KataBump ku-abort auto-restart, hivyo tunaendelea ku-poll badala yake).
            logger.error(
                "❌ Hakuna PAIRING_NUMBER iliyowekwa kwenye Environment Variables ya panel.\n" +
                "   Fungua Startup tab -> Variables -> weka PAIRING_NUMBER (mfano 255743383943)\n" +
                "   kisha restart server. Bot itasubiri hapa kwa dakika 5 kabla ya kujifunga."
            );

            // Subiri kidogo (badala ya exit mara moja) ili logs zisomeke na panel
            // isiwe na "rapid restart loop"; baada ya hapo jifunge kwa exit code isiyo-0
            // ili iwe wazi kwamba ni configuration error, sio crash ya kawaida.
            await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
            logger.error("Kuisha muda wa kusubiri PAIRING_NUMBER. Process inajifunga.");
            process.exit(1);
        }
    }

    await botManager.startBot(phoneNumber || null);

    // ---- MULTI-SESSION: rudisha sessions za watu wengine zilizopair kabla ----
    // (kwa .pairme). Tunasubiri kidogo ili owner bot iunganishwe kwanza,
    // kisha tunaanzisha child sessions moja baada ya nyingine.
    setTimeout(() => {
        try {
            const sessionManager = require("./lib/sessionManager");
            sessionManager.restoreSessions().catch((err) => {
                logger.warn(`Imeshindwa kurudisha multi-sessions: ${err.message}`);
            });
        } catch (err) {
            logger.warn(`sessionManager haikupakia: ${err.message}`);
        }
    }, 8000);
}

main().catch((err) => {
    logger.error(`Failed to start bot: ${err.message}`);
    console.error(err);
    process.exit(1);
});

process.on("uncaughtException", (err) => {
    logger.error(`Uncaught Exception: ${err.message}`);
});

process.on("unhandledRejection", (err) => {
    logger.error(`Unhandled Rejection: ${err?.message || err}`);
});
