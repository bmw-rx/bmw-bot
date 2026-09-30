/**
 * BMW LITE - Media Converter (ffmpeg)
 * MUHIMU: Hii inahitaji "ffmpeg" kuwa imesakinishwa kwenye server yako
 * (`ffmpeg -version` kwenye console ithibitishe). KataBump/Wispbyte nyingi
 * tayari zina ffmpeg, lakini kama haipo, .converter na .vv (voice) hazitafanya kazi.
 */
const fs = require("fs-extra");
const path = require("path");
const { spawn } = require("child_process");
const CONFIG = require("../config");

fs.ensureDirSync(CONFIG.tempDir);

function ffmpeg(buffer, args = [], ext = "", ext2 = "") {
    return new Promise(async (resolve, reject) => {
        try {
            const tmp = path.join(CONFIG.tempDir, Date.now() + "." + ext);
            const out = tmp + "." + ext2;

            await fs.promises.writeFile(tmp, buffer);

            spawn("ffmpeg", ["-y", "-i", tmp, ...args, out])
                .on("error", reject)
                .on("close", async (code) => {
                    try {
                        await fs.promises.unlink(tmp).catch(() => {});
                        if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}`));
                        const outputBuffer = await fs.promises.readFile(out);
                        await fs.promises.unlink(out).catch(() => {});
                        resolve(outputBuffer);
                    } catch (e) {
                        reject(e);
                    }
                });
        } catch (e) {
            reject(e);
        }
    });
}

/** Audio -> playable WhatsApp MP3 */
function toAudio(buffer, ext) {
    return ffmpeg(buffer, ["-vn", "-ac", "2", "-b:a", "128k", "-ar", "44100", "-f", "mp3"], ext, "mp3");
}

/** Audio -> WhatsApp voice note (PTT / Opus) */
function toPTT(buffer, ext) {
    return ffmpeg(buffer, ["-vn", "-c:a", "libopus", "-b:a", "128k", "-vbr", "on", "-compression_level", "10"], ext, "opus");
}

/** Video -> WhatsApp-compatible MP4 */
function toVideo(buffer, ext) {
    return ffmpeg(buffer, ["-c:v", "libx264", "-c:a", "aac", "-ab", "128k", "-ar", "44100", "-crf", "32", "-preset", "slow"], ext, "mp4");
}

module.exports = { toAudio, toPTT, toVideo, ffmpeg };
