/**
 * BMW LITE - Tools Library
 * Functions za .qrcode, .fancy, .calculate, .tinyurl
 */

const QRCode = require("qrcode");
const axios = require("axios");

/**
 * Tengeneza QR code kama PNG buffer kutoka kwa text
 */
async function generateQRCode(text) {
    return QRCode.toBuffer(text, {
        errorCorrectionLevel: "M",
        type: "png",
        width: 512,
        margin: 2,
        color: { dark: "#000000", light: "#FFFFFF" },
    });
}

/**
 * Fupisha URL kwa kutumia is.gd (huduma ya bure isiyohitaji API key)
 */
async function shortenUrl(url) {
    const res = await axios.get("https://is.gd/create.php", {
        params: { format: "simple", url },
        timeout: 15000,
    });
    return res.data;
}

/**
 * Fonti mbalimbali za "fancy text" - kila moja ni mapping ya herufi za kawaida
 * kwenda unicode style fulani.
 */
const FANCY_FONTS = {
    bubble: {
        a: "ⓐ", b: "ⓑ", c: "ⓒ", d: "ⓓ", e: "ⓔ", f: "ⓕ", g: "ⓖ", h: "ⓗ", i: "ⓘ",
        j: "ⓙ", k: "ⓚ", l: "ⓛ", m: "ⓜ", n: "ⓝ", o: "ⓞ", p: "ⓟ", q: "ⓠ", r: "ⓡ",
        s: "ⓢ", t: "ⓣ", u: "ⓤ", v: "ⓥ", w: "ⓦ", x: "ⓧ", y: "ⓨ", z: "ⓩ",
    },
    bold: {
        a: "𝐚", b: "𝐛", c: "𝐜", d: "𝐝", e: "𝐞", f: "𝐟", g: "𝐠", h: "𝐡", i: "𝐢",
        j: "𝐣", k: "𝐤", l: "𝐥", m: "𝐦", n: "𝐧", o: "𝐨", p: "𝐩", q: "𝐪", r: "𝐫",
        s: "𝐬", t: "𝐭", u: "𝐮", v: "𝐯", w: "𝐰", x: "𝐱", y: "𝐲", z: "𝐳",
    },
    script: {
        a: "𝓪", b: "𝓫", c: "𝓬", d: "𝓭", e: "𝓮", f: "𝓯", g: "𝓰", h: "𝓱", i: "𝓲",
        j: "𝓳", k: "𝓴", l: "𝓵", m: "𝓶", n: "𝓷", o: "𝓸", p: "𝓹", q: "𝓺", r: "𝓻",
        s: "𝓼", t: "𝓽", u: "𝓾", v: "𝓿", w: "𝔀", x: "𝔁", y: "𝔂", z: "𝔃",
    },
    smallcaps: {
        a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ғ", g: "ɢ", h: "ʜ", i: "ɪ",
        j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ", q: "ǫ", r: "ʀ",
        s: "s", t: "ᴛ", u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ",
    },
    upsidedown: {
        a: "ɐ", b: "q", c: "ɔ", d: "p", e: "ǝ", f: "ɟ", g: "ƃ", h: "ɥ", i: "ᴉ",
        j: "ɾ", k: "ʞ", l: "l", m: "ɯ", n: "u", o: "o", p: "d", q: "b", r: "ɹ",
        s: "s", t: "ʇ", u: "n", v: "ʌ", w: "ʍ", x: "x", y: "ʎ", z: "z",
    },
};

/**
 * Badilisha text kuwa fonti maalum (bubble, bold, script, n.k)
 * Hurudisha object: { fontName: result, ... } kwa fonti zote, au string moja
 * kama fontName imewekwa.
 */
function applyFancyFont(text, fontName = null) {
    const lower = text.toLowerCase();

    function convert(map) {
        return lower
            .split("")
            .map((ch) => map[ch] || ch)
            .join("");
    }

    if (fontName && FANCY_FONTS[fontName]) {
        return convert(FANCY_FONTS[fontName]);
    }

    const results = {};
    for (const [name, map] of Object.entries(FANCY_FONTS)) {
        results[name] = convert(map);
    }
    return results;
}

/**
 * Kikokotoo salama - inaruhusu tu nambari na alama za hesabu (+ - * / % ( ) .)
 * Haitumii eval() ili kuepuka hatari za usalama.
 */
function safeCalculate(expression) {
    const cleaned = expression.replace(/\s+/g, "");

    if (!/^[0-9+\-*/%().]+$/.test(cleaned)) {
        throw new Error("Hesabu ina alama zisizoruhusiwa. Tumia tu nambari na + - * / % ( )");
    }

    if (/[*/%]{2,}/.test(cleaned) || /\+{3,}/.test(cleaned)) {
        throw new Error("Hesabu si sahihi.");
    }

    try {
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${cleaned})`)();
        if (typeof result !== "number" || !isFinite(result)) {
            throw new Error("Jibu si nambari sahihi (huenda umegawa na sifuri).");
        }
        return result;
    } catch (err) {
        throw new Error("Imeshindwa kukokotoa: " + err.message);
    }
}

module.exports = {
    generateQRCode,
    shortenUrl,
    applyFancyFont,
    safeCalculate,
    FANCY_FONTS,
};
