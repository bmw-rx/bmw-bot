/**
 * BMW LITE - Cleanup Script
 * Husafisha faili za muda (temp) na cache zisizohitajika.
 * Matumizi: npm run cleanup   au   node cleanup.js
 */

const fs = require("fs-extra");
const path = require("path");

const TEMP_DIR = path.join(__dirname, "temp");

async function cleanup() {
    console.log("🧹 Ninaanza kusafisha faili za muda...");

    try {
        if (await fs.pathExists(TEMP_DIR)) {
            const files = await fs.readdir(TEMP_DIR);
            let count = 0;

            for (const file of files) {
                if (file === ".gitkeep") continue;
                const filePath = path.join(TEMP_DIR, file);
                await fs.remove(filePath);
                count++;
            }

            console.log(`✅ Faili ${count} za muda zimefutwa kutoka /temp`);
        } else {
            await fs.ensureDir(TEMP_DIR);
            console.log("ℹ️ Folder ya temp haikuwepo, imeundwa upya.");
        }

        // Safisha baileys store cache files (.json za zamani) ndani ya session ila usiguse creds
        const SESSION_DIR = path.join(__dirname, "session");
        if (await fs.pathExists(SESSION_DIR)) {
            const sessionFiles = await fs.readdir(SESSION_DIR);
            const preKeys = sessionFiles.filter(
                (f) => f.startsWith("pre-key-") || f.startsWith("sender-key-")
            );
            for (const f of preKeys) {
                await fs.remove(path.join(SESSION_DIR, f)).catch(() => {});
            }
            if (preKeys.length) {
                console.log(`✅ Pre-key/sender-key cache ${preKeys.length} zimefutwa.`);
            }
        }

        console.log("🎉 Usafishaji umekamilika!");
    } catch (err) {
        console.error("❌ Hitilafu wakati wa usafishaji:", err.message);
        process.exit(1);
    }
}

cleanup();
