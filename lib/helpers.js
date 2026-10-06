/**
 * BMW LITE - Helpers
 * Functions za msaada zinazotumika kote kwenye bot.
 */

const moment = require("moment-timezone");
const CONFIG = require("../config");

function now() {
    return moment().tz(CONFIG.timezone).format("DD/MM/YYYY HH:mm:ss");
}

function uptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
}

function isUrl(text = "") {
    return /^(https?:\/\/[^\s]+)$/i.test(text.trim());
}

const LINK_REGEX = /(?:https?:\/\/|www\.)[^\s]+|\b(?:chat\.whatsapp\.com|wa\.me|t\.me|telegram\.me|instagram\.com|facebook\.com|tiktok\.com|bit\.ly|youtu\.be|youtube\.com)\/[^\s]+/i;

function containsLink(text = "") {
    return LINK_REGEX.test(text);
}

function onOff(bool) {
    return bool ? "✅ ON" : "❌ OFF";
}

/**
 * Hupata text ya ujumbe kutoka kwa baileys message object
 */
function getMessageText(msg) {
    if (!msg) return "";
    const m = msg.message;
    if (!m) return "";
    return (
        m.conversation ||
        m.extendedTextMessage?.text ||
        m.imageMessage?.caption ||
        m.videoMessage?.caption ||
        m.buttonsResponseMessage?.selectedButtonId ||
        m.listResponseMessage?.singleSelectReply?.selectedRowId ||
        ""
    );
}

/**
 * Hutoa maandishi sahihi kutoka kwa response ya API isiyo na muundo dhahiri.
 * Hutatua tatizo la "[object Object]" linapotokea wakati API inarudisha
 * maandishi ndani ya field tofauti tofauti (data, result, message, answer, n.k)
 * au ndani ya object iliyowekwa ndani ya object nyingine.
 */
function extractText(res) {
    if (res === null || res === undefined) return null;
    if (typeof res === "string") return res;
    if (typeof res === "number" || typeof res === "boolean") return String(res);

    if (typeof res === "object") {
        // Jaribu fields za kawaida zinazotumika na API mbalimbali
        const candidates = [
            res.data,
            res.result,
            res.message,
            res.answer,
            res.response,
            res.text,
            res.output,
            res.content,
        ];

        for (const c of candidates) {
            if (typeof c === "string" && c.trim()) return c;
        }

        // Kama field hizo ni object/array tena, chimba ndani zaidi (kiwango kimoja)
        for (const c of candidates) {
            if (c && typeof c === "object" && !Array.isArray(c)) {
                const nested = extractText(c);
                if (nested) return nested;
            }
        }

        // Kama bado hatujapata, kama ni array, jaribu element ya kwanza
        if (Array.isArray(res) && res.length) {
            const nested = extractText(res[0]);
            if (nested) return nested;
        }
    }

    return null;
}

/**
 * Hutoa URL ya media (video/picha) kutoka kwa response ya API isiyo na muundo dhahiri.
 * Hutatua tatizo la downloader kushindwa ku-fetch video kwa sababu API inaweza
 * kurudisha URL ndani ya field tofauti tofauti.
 */
function extractMediaUrl(res) {
    if (!res) return null;
    if (typeof res === "string" && /^https?:\/\//i.test(res)) return res;

    if (typeof res === "object") {
        const data = res.data || res.result || res;
        const target = Array.isArray(data) ? data[0] : data;
        if (!target) return null;

        if (typeof target === "string" && /^https?:\/\//i.test(target)) return target;

        // Array ya links, mfano [{url,quality}] au [url1, url2] (Azbry facebook/tiktok)
        if (Array.isArray(target?.links) && target.links.length) {
            const first = target.links[0];
            if (typeof first === "string" && /^https?:\/\//i.test(first)) return first;
            if (first?.url && /^https?:\/\//i.test(first.url)) return first.url;
        }
        if (Array.isArray(target?.videos) && target.videos.length && typeof target.videos[0] === "string") {
            return target.videos[0];
        }
        if (Array.isArray(target?.images) && target.images.length && typeof target.images[0] === "string") {
            return target.images[0];
        }

        const fields = [
            "play", "video", "url", "nowm", "no_watermark", "noWatermark",
            "hd", "sd", "download", "downloadUrl", "media", "link", "mp4",
            "audio", "mp3", "dl", "download_url", "downloadLink", "image",
        ];

        for (const f of fields) {
            const val = target?.[f];
            if (typeof val === "string" && /^https?:\/\//i.test(val)) return val;
        }

        // Chimba ndani ya nested object (kiwango kimoja zaidi), mfano data.video.url
        // "music" imeondolewa kwenye orodha ya juu kwa makusudi (ni audio ya background
        // ya TikTok, si media halisi inayotakiwa kudownload) ili isichukuliwe kimakosa.
        for (const f of fields) {
            const val = target?.[f];
            if (val && typeof val === "object") {
                const nested = extractMediaUrl(val);
                if (nested) return nested;
            }
        }
    }

    return null;
}

/**
 * Tuma "download result" ya kawaida: kwanza thumbnail + details (kama picha yenye caption),
 * kisha media halisi iliyodownload (video/audio/image) kama ujumbe wa pili. Hii inatumika
 * kwa downloaders zote (tiktok, ytmp3, facebook, instagram) ili mtumiaji aone taarifa za
 * kile kinachodownload kabla ya kupokea faili lenyewe.
 *
 * @param {object} sock - Baileys socket
 * @param {string} jid - chat ID ya kutumia ujumbe
 * @param {object} msg - ujumbe wa asili (wa ku-quote)
 * @param {object} opts
 * @param {string} [opts.thumbnail] - URL ya thumbnail/cover
 * @param {string} opts.detailsText - maandishi ya details (title, author, duration, n.k)
 * @param {"video"|"audio"|"image"} opts.mediaType - aina ya media itakayotumwa baada ya details
 * @param {string|Buffer|{url:string}} opts.mediaContent - chanzo cha media (buffer au {url})
 * @param {string} [opts.fileName] - jina la faili (kwa audio/document)
 * @param {string} [opts.mimetype] - mimetype (kwa audio)
 */
async function sendDownloadResult(sock, jid, msg, opts) {
    const { thumbnail, detailsText, mediaType, mediaContent, fileName, mimetype } = opts;

    if (thumbnail) {
        await sock.sendMessage(jid, {
            image: { url: thumbnail },
            caption: detailsText,
        }, { quoted: msg }).catch(async () => {
            await sock.sendMessage(jid, { text: detailsText }, { quoted: msg }).catch(() => {});
        });
    } else {
        await sock.sendMessage(jid, { text: detailsText }, { quoted: msg }).catch(() => {});
    }

    const mediaMsg = { [mediaType]: mediaContent };
    if (mediaType === "audio") {
        mediaMsg.mimetype = mimetype || "audio/mpeg";
        if (fileName) mediaMsg.fileName = fileName;
    }
    await sock.sendMessage(jid, mediaMsg, { quoted: msg });
}

/**
 * Husafisha JID/namba kwa kuondoa device suffix (":23"), domain (@s.whatsapp.net, @lid, @g.us),
 * na alama zisizo namba, ili tubaki na namba safi tu ya kulinganisha.
 */
function cleanNumber(jidOrNumber = "") {
    if (!jidOrNumber) return "";
    let base = jidOrNumber.split("@")[0];
    base = base.split(":")[0];
    return base.replace(/[^0-9]/g, "");
}

/**
 * Hupima kama namba/JID fulani inalingana na CONFIG.owner
 */
function isOwnerNumber(jidOrNumber, ownerNumber) {
    const a = cleanNumber(jidOrNumber);
    const b = cleanNumber(ownerNumber);
    if (!a || !b) return false;
    return a === b;
}

/**
 * Hupata jid ya mtumiaji kutoka @mention ndani ya ujumbe (extendedTextMessage)
 * au kutoka quoted message participant.
 */
function getMentionedOrQuotedJid(msg) {
    const ctx = msg?.message?.extendedTextMessage?.contextInfo;
    if (ctx?.mentionedJid?.length) return ctx.mentionedJid[0];
    if (ctx?.participant) return ctx.participant;
    return null;
}

/**
 * Hupata jid zote zilizo-mention-iwa kwenye ujumbe
 */
function getAllMentionedJids(msg) {
    return msg?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
}

/**
 * Hupima kama mtumiaji fulani (jid) ni admin wa group husika.
 * Inahitaji group metadata (kutoka sock.groupMetadata(jid)).
 */
function isGroupAdmin(metadata, userJid) {
    const cleaned = cleanNumber(userJid);
    const participant = metadata.participants.find((p) => cleanNumber(p.id) === cleaned);
    return participant?.admin === "admin" || participant?.admin === "superadmin";
}

/**
 * Hupima kama bot yenyewe ni admin wa group (inahitajika kwa kick/promote/n.k)
 */
function isBotAdmin(metadata, botJid) {
    return isGroupAdmin(metadata, botJid);
}

/**
 * Hutuma ujumbe wa "loading" unaobadilika (animated) kwa kutumia uwezo wa
 * Baileys wa ku-edit ujumbe (message edit). Hii huipa mtumiaji hisia ya bot
 * "inafanya kazi" kabla matokeo halisi hayajatumwa - kama typing/progress animation.
 *
 * Inarudisha `key` ya ujumbe wa loading ili caller aweze kuu-edit tena
 * (kuwa matokeo ya mwisho) au kuufuta baada ya matokeo halisi kutumwa.
 *
 * Ikiwa kifaa/namba ya mtumiaji hazitumii message-edit (baadhi ya WA clients
 * za zamani), animation husimama kimya kimya bila kutoa error kwa mtumiaji.
 *
 * @param {object} sock - baileys socket
 * @param {string} jid - group/chat jid
 * @param {object} quoted - ujumbe wa awali (kwa ajili ya reply/quote)
 * @param {object} [opts]
 * @param {string[]} [opts.frames] - list ya frames za maandishi
 * @param {number} [opts.interval] - muda (ms) kati ya frame na frame
 * @returns {Promise<object|null>} key ya ujumbe wa loading (au null ikiwa imeshindwa)
 */
async function animateLoading(sock, jid, quoted, opts = {}) {
    const frames = opts.frames || [
        "🔄 Loading menu.",
        "🔄 Loading menu..",
        "🔄 Loading menu...",
        "⚙️ Preparing commands.",
        "⚙️ Preparing commands..",
        "⚙️ Preparing commands...",
        "✅ Menu ready!",
    ];
    const interval = opts.interval ?? 350;

    let sent;
    try {
        sent = await sock.sendMessage(jid, { text: frames[0] }, { quoted });
    } catch (err) {
        return null;
    }
    const key = sent?.key;
    if (!key) return null;

    for (let i = 1; i < frames.length; i++) {
        await new Promise((r) => setTimeout(r, interval));
        try {
            await sock.sendMessage(jid, { text: frames[i], edit: key });
        } catch (err) {
            // Kifaa/toleo la WA halisaidii message-edit - simama kimya kimya
            break;
        }
    }

    return key;
}

/**
 * Huanzisha "loading animation" inayoendesha sambamba (concurrently) na kazi
 * nyingine (mfano: kupiga API, kudownload faili). Tofauti na animateLoading(),
 * hii haisubiri animation imalizike kabla kazi haijaanza - frames zinaendelea
 * kubadilika mpaka stopLoading() iitwe, kisha ujumbe wa loading unafutwa.
 *
 * Matumizi:
 *   const loading = helpers.startLoading(sock, jid, msg);
 *   try {
 *       // ... fanya kazi ndefu (API call, download, n.k) ...
 *   } finally {
 *       await helpers.stopLoading(sock, jid, loading);
 *   }
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} quoted
 * @param {object} [opts]
 * @param {string[]} [opts.frames]
 * @param {number} [opts.interval]
 * @returns {object} loading state - ipitishe kwa stopLoading()
 */
function startLoading(sock, jid, quoted, opts = {}) {
    const frames = opts.frames || [
        "🔄 Processing...",
        "⚙️ Working on it...",
        "📡 Fetching data...",
        "✨ Almost done...",
    ];
    const interval = opts.interval ?? 1200;
    const state = { stopped: false, key: null, loopPromise: null };

    state.loopPromise = (async () => {
        let sent;
        try {
            sent = await sock.sendMessage(jid, { text: frames[0] }, { quoted });
        } catch (err) {
            return;
        }
        state.key = sent?.key;
        if (!state.key) return;

        let i = 1;
        while (!state.stopped) {
            await new Promise((r) => setTimeout(r, interval));
            if (state.stopped) break;
            try {
                await sock.sendMessage(jid, { text: frames[i % frames.length], edit: state.key });
            } catch (err) {
                break; // Kifaa/toleo la WA halisaidii message-edit - simama kimya kimya
            }
            i++;
        }
    })();

    return state;
}

/**
 * Husimamisha loading animation iliyoanzishwa na startLoading() na kufuta
 * ujumbe wake wa "loading" (kazi halisi tayari imekwisha tuma matokeo yake).
 *
 * @param {object} sock
 * @param {string} jid
 * @param {object} state - kilichorudishwa na startLoading()
 */
async function stopLoading(sock, jid, state) {
    if (!state) return;
    state.stopped = true;
    await state.loopPromise?.catch(() => {});
    if (state.key) {
        await sock.sendMessage(jid, { delete: state.key }).catch(() => {});
    }
}

module.exports = {
    now,
    uptime,
    isUrl,
    containsLink,
    onOff,
    getMessageText,
    extractText,
    extractMediaUrl,
    sendDownloadResult,
    cleanNumber,
    isOwnerNumber,
    getMentionedOrQuotedJid,
    getAllMentionedJids,
    isGroupAdmin,
    isBotAdmin,
    animateLoading,
    startLoading,
    stopLoading,
    LINK_REGEX,
};
