/**
 * BMW LITE - Commands Handler
 * This is where all "." commands are processed.
 */

const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const CONFIG = require("./config");
const api = require("./lib/api");
const helpers = require("./lib/helpers");
const logger = require("./lib/logger");
const settingsManager = require("./lib/settings");
const { handleGroupCommand } = require("./lib/groupCommands");
const { handleExtraCommand } = require("./lib/extraCommands");
const { handleApiCommand, sendCmntyAio } = require("./lib/apiCommands");
const socialStore = require("./lib/socialStore");
const updater = require("./lib/updater");

const startTime = Date.now();

/**
 * Checks if message was sent by OWNER (as configured in CONFIG.owner),
 * or by the bot itself (fromMe) - which we also count as owner
 * since it's the same phone number that paired the bot.
 */
function isFromOwner(sender, msg) {
    if (msg?.key?.fromMe) return true;
    return helpers.isOwnerNumber(sender, CONFIG.owner);
}

/**
 * Send a simple text message, replying to (quoting) the previous message
 */
async function reply(sock, jid, text, quoted) {
    return sock.sendMessage(jid, { text }, { quoted });
}

async function reactTo(sock, jid, key, emoji) {
    try {
        await sock.sendMessage(jid, { react: { text: emoji, key } });
    } catch (e) {
        /* ignore react errors */
    }
}

/**
 * Kila "category" ya menu - jina, icon, na list ya commands zake.
 * Template `{p}` inabadilishwa na prefix halisi wakati wa kuchora (render).
 * Muundo huu mmoja unatumika kwa menu kamili (.menu all), index (.menu),
 * na category moja moja (.menu ai, .menu tools, n.k) - chanzo kimoja cha
 * ukweli (single source of truth) badala ya kuandika maandishi mara nyingi.
 */
const MENU_SECTIONS = [
    {
        key: "ai", aliases: ["ai", "chat"], icon: "🤖", title: "AI & CHAT",
        items: ["{p}ai [question]", "{p}ai img [prompt]", "{p}img [prompt]", "{p}chatbot on/off", "{p}bible [question]", "{p}bible2 [verse]"],
    },
    {
        key: "downloader", aliases: ["downloader", "download", "dl"], icon: "⬇️", title: "DOWNLOADER",
        items: ["{p}play [song name]", "{p}tiktok [url]", "{p}tiktokslide [url]", "{p}fb [url]", "{p}ig [url]", "{p}aio [url]  (IG/TikTok/FB/X n.k)", "{p}ytsmp4 [url]  (or .ytdl)", "{p}ytmp3 [url]", "{p}gdrive [url]", "{p}apk [app name]", "{p}song"],
    },
    {
        key: "image", aliases: ["image", "img", "imagemaker"], icon: "🎨", title: "IMAGE MAKER",
        items: ["{p}photooxy [text]", "{p}ephoto [text]", "{p}textpro [text]", "{p}imggrt2 [prompt]", "{p}emojimix [emoji1] [emoji2]", "{p}wanted [reply img / url]", "{p}wasted [reply img / url]"],
    },
    {
        key: "tools", aliases: ["tools", "tool"], icon: "🛠️", title: "TOOLS",
        items: ["{p}tts [text]", "{p}pdfcrt [text]", "{p}ss [url]", "{p}ssweb [url]", "{p}country [name]", "{p}qrcode [text]", "{p}shortlink [url]", "{p}fancy [text]", "{p}calculate [expr]", "{p}sticker", "{p}vv", "{p}removebg (reply picha)", "{p}enhance (reply picha)", "{p}tempemail", "{p}converter [mp3/ptt/mp4] (reply media)", "{p}getpp (tag/reply mtu)", "{p}genpass [length]", "{p}url (reply media)", "{p}qwa (reply ujumbe)", "{p}cekdevice"],
    },
    {
        key: "search", aliases: ["search"], icon: "🔎", title: "SEARCH",
        items: ["{p}gimg [query]", "{p}yt [query]", "{p}lyrics [song]", "{p}lyrics2 [song]", "{p}movie [title]", "{p}spotify [song]", "{p}netflix [title]", "{p}playstore [app]", "{p}wallpaper [query]"],
    },
    {
        key: "info", aliases: ["info", "api"], icon: "🌐", title: "INFO & API",
        items: ["{p}weather [city]", "{p}news [category]", "{p}tr [lang] [text]", "{p}livescore", "{p}livefootball", "{p}jokes", "{p}quotes", "{p}meme"],
    },
    {
        key: "fake", aliases: ["fake", "fakemaker"], icon: "🎭", title: "FAKE MAKER",
        items: ["{p}fakebio [jina]", "{p}fakegroup [jina] | [peserta] (reply picha)", "{p}fakeinsta", "{p}fakemusic [jina] (reply picha)", "{p}fakewa [jina]|[ujumbe]", "{p}videoplayer (reply picha)"],
    },
    {
        key: "fun", aliases: ["fun", "utility"], icon: "🎉", title: "FUN & UTILITY",
        items: ["{p}afk [reason]", "{p}toimg (reply sticker)", "{p}save (reply status)", "{p}remind [minutes] [text]", "{p}fact", "{p}trivia"],
    },
    {
        key: "basic", aliases: ["basic"], icon: "⚙️", title: "BASIC",
        items: ["{p}ping", "{p}hello", "{p}time", "{p}status", "{p}menu", "{p}pair", "{p}update"],
    },
    {
        key: "group", aliases: ["group", "admin"], icon: "👥", title: "GROUP (Admin)",
        items: ["{p}kick [@user]", "{p}promote [@user]", "{p}demote [@user]", "{p}warn [@user] [reason]", "{p}warnings [@user]", "{p}resetwarn [@user]", "{p}tagall [msg]", "{p}hidetag [msg]", "{p}groupinfo", "{p}link", "{p}revoke", "{p}close", "{p}open", "{p}welcome on/off", "{p}goodbye on/off", "{p}setwelcome [msg]", "{p}setgoodbye [msg]", "{p}antilinkgc on/off", "{p}antimationgroup on/off", "{p}tosgroup"],
    },
    {
        key: "session", aliases: ["session", "multi", "multisession"], icon: "🌐", title: "MULTI-SESSION",
        items: ["{p}pairme [number]", "{p}unpair", "{p}mysessions (Owner)"],
    },
    {
        key: "settings", aliases: ["settings", "config"], icon: "🔧", title: "SETTINGS (Owner)",
        items: ["{p}setprefix [char]", "{p}setbotname [name]", "{p}autoread on/off", "{p}chatbot on/off", "{p}mode public/private", "{p}getsettings", "{p}trust [feature] @mtu", "{p}untrust [feature] @mtu", "{p}listtrust", "{p}silentlog [all]"],
    },
    {
        key: "auto", aliases: ["auto"], icon: "🔁", title: "AUTO (Owner)",
        items: ["{p}autostatusview on/off", "{p}autotyping on/off", "{p}autorecord on/off", "{p}autoreact on/off", "{p}autoreactstatus on/off", "{p}antilink on/off", "{p}antidelete on/off", "{p}channelbranding on/off"],
    },
];

function findMenuSection(query) {
    const q = (query || "").toLowerCase().trim();
    if (!q) return null;
    return MENU_SECTIONS.find((s) => s.key === q || s.aliases.includes(q)) || null;
}

/** Habari za wakati ("Habari za asubuhi/mchana/jioni/usiku") kulingana na saa ya sasa */
function timeGreeting() {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return "Good morning";
    if (h >= 12 && h < 17) return "Good afternoon";
    if (h >= 17 && h < 21) return "Good evening";
    return "Good night";
}

function renderSection(section, p) {
    const lines = [`┌──❮ ${section.icon} *${section.title}* ❯`];
    section.items.forEach((item) => lines.push(`├▸ ${item.replace(/\{p\}/g, p)}`));
    lines.push(`└────────────❍`);
    return lines.join("\n");
}

/**
 * Header ya menu yenye "live stats" halisi (uptime, RAM, jumla ya commands)
 * na salamu ya kibinafsi (kulingana na saa + jina la mtumiaji + rank yake).
 */
function buildMenuHeader({ pushName, isOwner } = {}) {
    const s = settingsManager.getSettings();
    const p = s.prefix || CONFIG.prefix;
    const botName = s.botName || CONFIG.botName;

    const uptimeMs = Date.now() - startTime;
    const upH = Math.floor(uptimeMs / 3600000);
    const upM = Math.floor((uptimeMs % 3600000) / 60000);
    const upS = Math.floor((uptimeMs % 60000) / 1000);
    const uptime = `${upH}h ${upM}m ${upS}s`;
    const now = new Date();
    const date = now.toLocaleDateString("en-GB");
    const time = now.toLocaleTimeString("en-GB");

    const mem = process.memoryUsage();
    const ramMB = (mem.rss / 1024 / 1024).toFixed(1);
    const totalCommands = MENU_SECTIONS.reduce((sum, sec) => sum + sec.items.length, 0);

    const greetName = pushName ? `, *${pushName}*` : "";
    const rankLabel = isOwner ? "👑 Owner" : "👤 User";

    return {
        p,
        botName,
        text: `╔═══════════════════╗
   ⚡ *${botName}* ⚡
╚═══════════════════╝
${timeGreeting()}${greetName}! 👋  (${rankLabel})

┌─❏ *SYSTEM*
├ ◈ Version   : ${CONFIG.version}
├ ◈ Prefix    : [ ${p} ]
├ ◈ Uptime    : ${uptime}
├ ◈ RAM Usage : ${ramMB} MB
├ ◈ Commands  : ${totalCommands}
├ ◈ Date      : ${date}
├ ◈ Time      : ${time}
└──────────────❏`,
    };
}

/** ".menu" bila hoja - index/compact ya makundi yote (pagination) */
function buildMenuIndex(ctx) {
    const { p, botName, text: header } = buildMenuHeader(ctx);

    const catLines = MENU_SECTIONS.map((s) => {
        const label = `${s.icon} ${s.key}`.padEnd(16, " ");
        return `├ ${label} (${s.items.length})`;
    });

    return `${header}

┌─❏ *CATEGORIES*
${catLines.join("\n")}
└──────────────❏

💡 Type: *${p}menu [name]* — e.g: *${p}menu ai*
📜 Or: *${p}menu all* — see every command at once

▰▰▰▰▰▰▰▰▰▰▰▰▰
   _${botName}_
   ⚡ ${CONFIG.onlineFooter || "Powered by Baileys"} ⚡${CONFIG.botChannel ? `\n   📢 ${CONFIG.botChannel}` : ""}
▰▰▰▰▰▰▰▰▰▰▰▰▰`;
}

/** ".menu [category]" - commands for a single category only */
function buildMenuCategory(section, ctx) {
    const { p, botName, text: header } = buildMenuHeader(ctx);

    return `${header}

${renderSection(section, p)}

💡 Back to the full list: *${p}menu*

▰▰▰▰▰▰▰▰▰▰▰▰▰
   _${botName}_
▰▰▰▰▰▰▰▰▰▰▰▰▰`;
}

/** ".menu all" - full menu (every category and its commands, as before) */
function buildMenuFull(ctx) {
    const { p, botName, text: header } = buildMenuHeader(ctx);

    const sections = MENU_SECTIONS.map((s) => renderSection(s, p)).join("\n\n");

    return `${header}

${sections}

▰▰▰▰▰▰▰▰▰▰▰▰▰
   _${botName}_
   ⚡ ${CONFIG.onlineFooter || "Powered by Baileys"} ⚡${CONFIG.botChannel ? `\n   📢 ${CONFIG.botChannel}` : ""}
▰▰▰▰▰▰▰▰▰▰▰▰▰`;
}

/**
 * Download "view once" media from quoted message
 */
async function handleViewOnce(sock, jid, msg, quoted) {
    if (!quoted) {
        return reply(sock, jid, "❗ Reply to a 'view once' message using .vv", msg);
    }

    let vvMsg =
        quoted.viewOnceMessageV2?.message ||
        quoted.viewOnceMessage?.message ||
        quoted.viewOnceMessageV2Extension?.message ||
        quoted;

    const imageMsg = vvMsg?.imageMessage;
    const videoMsg = vvMsg?.videoMessage;

    if (!imageMsg && !videoMsg) {
        return reply(sock, jid, "❗ That message is not a recognized 'view once' message.", msg);
    }

    try {
        const type = imageMsg ? "image" : "video";
        const stream = await downloadContentFromMessage(imageMsg || videoMsg, type);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        if (type === "image") {
            await sock.sendMessage(jid, {
                image: buffer,
                caption: imageMsg.caption || "📸 View Once Image (Opened)",
            });
        } else {
            await sock.sendMessage(jid, {
                video: buffer,
                caption: videoMsg.caption || "🎥 View Once Video (Opened)",
            });
        }
    } catch (err) {
        logger.error(`VV Error: ${err.message}`);
        await reply(sock, jid, `❌ Failed to open view once. Please try again later.`, msg);
    }
}

/**
 * Main command handler
 * @param {object} sock - baileys socket
 * @param {object} msg - full message object
 * @param {string} command - command without prefix, lowercase
 * @param {string[]} args - arguments
 * @param {string} text - args joined into one text
 */
async function handleCommand(sock, msg, command, args, text) {
    const jid = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const isOwner = isFromOwner(sender, msg);
    const isGroup = jid.endsWith("@g.us");
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    try {
        const liveSettings = settingsManager.getSettings();

        // --- FEATURE: Silent Log ---
        // Kama group hii (au "ALL_GROUPS") imewekwa silent, tunaruka
        // logger.cmd() kabisa kwa ujumbe huu - kwa faragha ya wateja wa
        // biashara wasiotaka commands zao ku-onekana kwenye console/logs.
        const silentList = Array.isArray(liveSettings.silentLogGroups) ? liveSettings.silentLogGroups : [];
        const isSilenced = isGroup && (silentList.includes(jid) || silentList.includes("ALL_GROUPS"));
        if (!isSilenced) {
            logger.cmd(`${command} from ${sender}`);
        }

        // --- FEATURE: Trust System ---
        // .trust <feature> @mtu inampa mtu exemption ya feature MOJA MOJA
        // (si owner-level access kamili) dhidi ya disabledCommands/cooldown.
        const trustedFeatures = liveSettings.trustedUsers?.[sender] || [];
        const isTrustedForThis = trustedFeatures.includes(command) || trustedFeatures.includes("*");

        // --- FEATURE 6: Command Toggle Panel ---
        // Owner haizuiliwi na toggle (anaweza kuendelea kutumia command
        // aliyoizima kwa bahati mbaya, ili aweze kuiwasha tena kwa .cmdon).
        if (!isOwner && !isTrustedForThis && Array.isArray(liveSettings.disabledCommands) && liveSettings.disabledCommands.includes(command)) {
            return reply(sock, jid, `🚫 Command *.${command}* imezimwa kwa sasa.`, msg);
        }

        // --- BONUS FEATURE: Command Cooldown / Rate Limiter ---
        // Owner na watu waliotrust-iwa kwa command hii huepukwa na cooldown.
        if (!isOwner && !isTrustedForThis && liveSettings.commandCooldowns && liveSettings.commandCooldowns[command]) {
            const cd = settingsManager.checkAndSetCooldown(
                CONFIG.owner, // sessionLabel - inatofautisha session moja na nyingine
                command,
                sender,
                liveSettings.commandCooldowns[command]
            );
            if (cd.onCooldown) {
                return reply(sock, jid, `⏳ Subiri sekunde ${cd.remaining} zaidi kabla ya kutumia *.${command}* tena.`, msg);
            }
        }

        // First try Group Commands (kick, promote, tagall, welcome, etc.)
        const handledByGroup = await handleGroupCommand(sock, msg, command, args, text);
        if (handledByGroup) return;

        // Then try Extra Commands (settings + tools: setprefix, qrcode, sticker, etc.)
        const handledByExtra = await handleExtraCommand(sock, msg, command, args, text);
        if (handledByExtra) return;

        // Then try API Commands (weather, lyrics, jokes, quotes, news, etc.)
        const handledByApi = await handleApiCommand(sock, msg, command, args, text);
        if (handledByApi) return;

        switch (command) {
            /* ===================== BASIC ===================== */
            case "ping": {
                const start = Date.now();
                const sent = await reply(sock, jid, "🏓 Pinging...", msg);
                const latency = Date.now() - start;
                await sock.sendMessage(
                    jid,
                    { text: `🏓 Pong! ${latency}ms`, edit: sent.key }
                ).catch(async () => {
                    await reply(sock, jid, `🏓 Pong! ${latency}ms`, msg);
                });
                break;
            }

            case "hello": {
                await reply(sock, jid, `👋 Hello! I'm *${CONFIG.botName}*, ready to help you.\nType *.menu* to see all available commands.`, msg);
                break;
            }

            case "time": {
                await reply(sock, jid, `🕒 Current time: ${helpers.now()} (${CONFIG.timezone})`, msg);
                break;
            }

            case "status": {
                const s = settingsManager.getSettings();
                const upSec = (Date.now() - startTime) / 1000;
                await reply(
                    sock,
                    jid,
                    `📊 *${s.botName || CONFIG.botName} STATUS*\n\n` +
                    `🟢 Status: Online\n` +
                    `⏱️ Uptime: ${helpers.uptime(upSec)}\n` +
                    `📦 Version: ${CONFIG.version}\n` +
                    `🔤 Prefix: ${s.prefix || CONFIG.prefix}\n` +
                    `🔒 Mode: ${s.mode || "public"}\n\n` +
                    `*Auto Features:*\n` +
                    `Auto Status View: ${helpers.onOff(s.autoStatusView)}\n` +
                    `Auto Typing: ${helpers.onOff(s.autoTyping)}\n` +
                    `Auto React (messages): ${helpers.onOff(s.autoReactMessages)}\n` +
                    `Auto React Status: ${helpers.onOff(s.autoReactStatus)}\n` +
                    `Auto Read: ${helpers.onOff(s.autoRead)}\n` +
                    `Chatbot Mode: ${helpers.onOff(s.chatbotMode)}\n` +
                    `Anti Delete: ${helpers.onOff(s.antiDelete)}\n` +
                    `Channel Branding: ${helpers.onOff(s.channelBranding)}`,
                    msg
                );
                break;
            }

            case "menu": {
                const ctx = { pushName: msg.pushName || null, isOwner };
                const categoryArg = (args[0] || "").toLowerCase();

                // Show a "loading" animation (message edits a few times) before the
                // actual menu is sent - uses Baileys' message-edit feature.
                const loadingKey = await helpers.animateLoading(sock, jid, msg).catch(() => null);

                let menuText;
                if (categoryArg === "all") {
                    menuText = buildMenuFull(ctx);
                } else if (categoryArg) {
                    const section = findMenuSection(categoryArg);
                    if (!section) {
                        if (loadingKey) await sock.sendMessage(jid, { delete: loadingKey }).catch(() => {});
                        const validKeys = MENU_SECTIONS.map((sec) => sec.key).join(", ");
                        return reply(sock, jid, `❗ Category "${categoryArg}" not found.\n\nAvailable: ${validKeys}\n\nExample: ${CONFIG.prefix}menu ai`, msg);
                    }
                    menuText = buildMenuCategory(section, ctx);
                } else {
                    menuText = buildMenuIndex(ctx);
                }

                if (CONFIG.botImage) {
                    await sock.sendMessage(jid, {
                        image: { url: CONFIG.botImage },
                        caption: menuText,
                    }, { quoted: msg }).catch(async (err) => {
                        logger.warn(`Menu image failed, sending text only: ${err.message}`);
                        await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
                    });

                    // Menu halisi (yenye picha) haiwezi kubadilisha ujumbe wa maandishi wa
                    // loading (Baileys haruhusu edit kubadili aina ya ujumbe), hivyo tunaufuta.
                    if (loadingKey) {
                        await sock.sendMessage(jid, { delete: loadingKey }).catch(() => {});
                    }
                } else if (loadingKey) {
                    // Hakuna picha - tunageuza ujumbe wa loading kuwa menu halisi (edit ya mwisho)
                    await sock.sendMessage(jid, { text: menuText, edit: loadingKey }).catch(async () => {
                        await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
                    });
                } else {
                    await sock.sendMessage(jid, { text: menuText }, { quoted: msg });
                }

                if (CONFIG.botSong) {
                    try {
                        // Tunadownload buffer moja kwa moja badala ya kutumia { url } pekee -
                        // hii ni imara zaidi kwa sababu baadhi ya WhatsApp clients hushindwa
                        // ku-stream baadhi ya URL moja kwa moja (hasa catbox.moe links).
                        const axios = require("axios");
                        const res = await axios.get(CONFIG.botSong, {
                            responseType: "arraybuffer",
                            timeout: 30000,
                            headers: { "User-Agent": "Mozilla/5.0 (BMW-LITE-BOT)" },
                        });
                        const buffer = Buffer.from(res.data);

                        await sock.sendMessage(jid, {
                            audio: buffer,
                            mimetype: "audio/mpeg",
                            fileName: "menu-song.mp3",
                            ptt: false,
                        }, { quoted: msg });
                    } catch (err) {
                        logger.error(`Menu song failed to send: ${err.message}`);
                        // Onyesha error badala ya kunyamaza kimya, ili tujue kama link
                        // imekufa au tatizo lingine limejitokeza
                        await reply(sock, jid, `⚠️ Menu song failed to send. Please try again later.`, msg).catch(() => {});
                    }
                }
                break;
            }

            case "pair": {
                if (!isOwner) return reply(sock, jid, "🚫 This command is owner only.", msg);
                
                // If phone number provided, trigger pairing for that number
                if (text && text.replace(/[^0-9]/g, '').length > 9) {
                    const phoneNumber = text.replace(/[^0-9]/g, '');
                    try {
                        await reply(sock, jid, "⏳ Generating pairing code...", msg);
                        const code = await sock.requestPairingCode(phoneNumber);
                        const formatted = code?.match(/.{1,4}/g)?.join("-") || code;
                        await reply(sock, jid, 
                            `🔐 *Pairing Code Generated*\n\n` +
                            `Phone: ${text}\n` +
                            `Code: *${formatted}*\n\n` +
                            `Steps:\n` +
                            `1. Open WhatsApp\n` +
                            `2. Settings → Linked Devices\n` +
                            `3. Link a Device\n` +
                            `4. Link with phone number\n` +
                            `5. Enter code above\n\n` +
                            `⏱️ Code expires in 60 seconds\n\n` +
                            `Dashboard: http://localhost:3000`, 
                            msg
                        );
                    } catch (err) {
                        logger.error(`Pair command error: ${err.message}`);
                        await reply(sock, jid, `❌ Failed. Please try again later.`, msg);
                    }
                } else {
                    // Show bot info and dashboard link
                    await reply(sock, jid, 
                        `🔐 *Pairing Information*\n\n` +
                        `Bot Status: Connected ✓\n\n` +
                        `To add another phone:\n` +
                        `${CONFIG.prefix}pair 255743383943\n\n` +
                        `Full Dashboard:\n` +
                        `http://localhost:3000`, 
                        msg
                    );
                }
                break;
            }

            /* ===================== UPDATE ===================== */
            case "update": {
                if (!isOwner) return reply(sock, jid, "🚫 This command is owner only.", msg);

                const action = (args[0] || "").toLowerCase();

                // .update check  -> only check for updates without applying
                if (action === "check") {
                    await reply(sock, jid, "🔍 Checking for updates...", msg);
                    try {
                        const info = await updater.checkForUpdates();
                        if (info.behind === 0) {
                            return reply(sock, jid, "✅ Bot is already up to date.", msg);
                        }
                        return reply(
                            sock,
                            jid,
                            `🆕 *Update Available*\n\n` +
                            `Branch: ${info.branch}\n` +
                            `Commits behind: ${info.behind}\n\n` +
                            `*Latest changes:*\n${info.commits || "(no log)"}\n\n` +
                            `Run *${CONFIG.prefix}update* to install.`,
                            msg
                        );
                    } catch (err) {
                        logger.error(`Update check error: ${err.message}`);
                        return reply(sock, jid, `❌ Update check failed. Please try again later.`, msg);
                    }
                }

                // .update -> pull latest code and install deps
                await reply(sock, jid, "⏳ Updating bot from GitHub...\n" + updater.REPO_URL, msg);
                try {
                    const result = await updater.performUpdate();
                    await reply(
                        sock,
                        jid,
                        `✅ *Update Complete*\n\n` +
                        `Branch: ${result.branch}\n` +
                        `Bot updated to the latest version.\n\n` +
                        `♻️ Restart the bot to apply changes:\n` +
                        `_npm start_ (or restart your process manager)`,
                        msg
                    );
                } catch (err) {
                    logger.error(`Update error: ${err.message}`);
                    await reply(sock, jid, `❌ Update failed. Please try again later.`, msg);
                }
                break;
            }

            /* ===================== AI ===================== */
            case "aiimg":
            case "ai": {
                // .ai img <prompt>  AU  .aiimg <prompt>  -> tengeneza picha kwa AI
                const isImageRequest = command === "aiimg" || (args[0] || "").toLowerCase() === "img";
                if (isImageRequest) {
                    const prompt = command === "aiimg" ? text : args.slice(1).join(" ");
                    if (!prompt) return reply(sock, jid, `❗ Example: ${CONFIG.prefix}ai img a cute cat`, msg);

                    await reply(sock, jid, "🎨 Generating AI image...", msg);

                    let res;
                    try {
                        res = await api.bintangAiImage(prompt);
                    } catch (err) {
                        logger.error(`AI image error: ${err.message}`);
                        return reply(sock, jid, `❌ AI image failed. Please try again later.`, msg);
                    }

                    // API ikirudisha picha moja kwa moja (binary)
                    if (res?.type === "image" && res.buffer) {
                        await sock.sendMessage(jid, {
                            image: res.buffer,
                            caption: `🎨 *${prompt}*\n\n_${CONFIG.botName}_`,
                        }, { quoted: msg }).catch(async (err) => {
                            logger.error(`AI image send error: ${err.message}`);
                            await reply(sock, jid, `❌ Image created but failed to send. Please try again later.`, msg);
                        });
                        break;
                    }

                    // API ikirudisha JSON yenye link
                    const json = res?.data || res;
                    const imgUrl = helpers.extractMediaUrl(json);
                    if (!imgUrl) {
                        logger.error(`AI image: URL not found. Raw response: ${JSON.stringify(json).slice(0, 800)}`);
                        return reply(sock, jid, "❌ Failed to create image. Please try again later.", msg);
                    }
                    await sock.sendMessage(jid, {
                        image: { url: imgUrl },
                        caption: `🎨 *${prompt}*\n\n_${CONFIG.botName}_`,
                    }, { quoted: msg });
                    break;
                }

                if (!text) return reply(sock, jid, `❗ Example: ${CONFIG.prefix}ai What is the meaning of life?`, msg);

                if (!CONFIG.groqApiKey && !CONFIG.openrouterApiKey) {
                    return reply(
                        sock,
                        jid,
                        "❌ Hakuna AI API key iliyowekwa.\n" +
                        "Weka GROQ_API_KEY au OPENROUTER_API_KEY kwenye Environment Variables ya panel.\n" +
                        "Groq (free): https://console.groq.com/keys\n" +
                        "OpenRouter (free): https://openrouter.ai/keys",
                        msg
                    );
                }

                await reply(sock, jid, "🤖 Thinking...", msg);

                try {
                    const { answer, provider } = await api.aiChat(text);
                    await reply(sock, jid, `🤖 *AI (${provider})*\n\n${answer}`, msg);
                } catch (err) {
                    logger.error(`AI error: ${err.message}`);
                    return reply(sock, jid, `❌ AI Error. Please try again later.`, msg);
                }
                break;
            }

            case "bible": {
                if (!text) return reply(sock, jid, `❗ Example: ${CONFIG.prefix}bible What is faith? ESV`, msg);
                const parts = args.slice();
                let translation = "ESV";
                const lastWord = parts[parts.length - 1]?.toUpperCase();
                if (["ESV", "NIV", "KJV"].includes(lastWord)) {
                    translation = lastWord;
                    parts.pop();
                }
                const question = parts.join(" ");
                if (!question) return reply(sock, jid, `❗ Example: ${CONFIG.prefix}bible What is faith? ESV`, msg);

                await reply(sock, jid, "📖 Searching Bible...", msg);
                const res = await api.bibleAI(question, translation);
                const answer = helpers.extractText(res);
                if (!answer) {
                    logger.error(`Bible AI: failed to get answer. Raw response: ${JSON.stringify(res).slice(0, 500)}`);
                    return reply(sock, jid, "❌ Failed to get answer. Please try again later.", msg);
                }
                await reply(sock, jid, `📖 *Bible AI (${translation})*\n\n${answer}`, msg);
                break;
            }

            /* ===================== DOWNLOADER ===================== */
            case "tiktok": {
                const url = args[0];
                if (!url || !helpers.isUrl(url)) return reply(sock, jid, `❗ Send a valid URL. Example: ${CONFIG.prefix}tiktok https://vt.tiktok.com/xxxx`, msg);

                const __loading = helpers.startLoading(sock, jid, msg, {
                    frames: ["⬇️ Downloading TikTok video...", "📡 Fetching from source...", "🎞️ Almost there..."],
                });
                try {

                // Try CMNTY all-in-one downloader first (covers TikTok + most other platforms)
                try {
                    const sentByCmnty = await sendCmntyAio(sock, jid, msg, url);
                    if (sentByCmnty) {
                        break;
                    }
                } catch (err) {
                    logger.warn(`[CMNTY API] aiov3 failed for TikTok, falling back to Azbry: ${err.message}`);
                }

                // Jaribu Azbry API kwanza, ikishindwa rudi kwenye Siputzx (fallback)
                let videoUrl = null;
                let thumbnail = null;
                let title = null;
                let authorName = "TikTok";
                let durationSec = null;

                try {
                    const azRes = await api.azbryTiktok(url);
                    if (azRes?.type === "video" && azRes.buffer) {
                        // Azbry ilirudisha video moja kwa moja (buffer) - hakuna JSON details
                        await sock.sendMessage(jid, {
                            video: azRes.buffer,
                            caption: `🎵 *TikTok*\n\n_${CONFIG.botName}_`,
                        }, { quoted: msg });
                        break;
                    }
                    // Muundo halisi wa Azbry: { result: { title, author, thumbnail, duration, music, links: [hd, sd, wm] } }
                    const azJson = azRes?.data || azRes;
                    const azItem = azJson?.result || azJson?.data || azJson;
                    videoUrl =
                        (Array.isArray(azItem?.links) && azItem.links[0]) ||
                        azItem?.video?.noWatermark ||
                        azItem?.video?.no_watermark ||
                        azItem?.hd ||
                        azItem?.nowm ||
                        azItem?.play ||
                        azItem?.video_no_watermark ||
                        azItem?.url ||
                        helpers.extractMediaUrl(azJson);
                    thumbnail = azItem?.thumbnail || azItem?.cover || null;
                    title = azItem?.title || null;
                    durationSec = azItem?.duration || null;
                    authorName =
                        (typeof azItem?.author === "string" && azItem.author) ||
                        azItem?.author?.nickname ||
                        azItem?.author?.name ||
                        azItem?.username ||
                        "TikTok";
                } catch (err) {
                    logger.warn(`[Azbry API] TikTok failed, falling back to Siputzx: ${err.message}`);
                }

                if (!videoUrl) {
                    let res;
                    try {
                        res = await api.tiktokDownload(url);
                    } catch (err) {
                        logger.error(`[Siputzx API] TikTok error: ${err.message}`);
                        return reply(sock, jid, `❌ TikTok Downloader failed. Please try again later.`, msg);
                    }

                    if (res && res.status === false) {
                        logger.error(`[Siputzx API] TikTok returned status:false. Raw: ${JSON.stringify(res).slice(0, 500)}`);
                        return reply(sock, jid, `❌ TikTok Downloader: ${res.message || "video not found or link invalid"}`, msg);
                    }

                    const data = res?.data || res?.result || res;
                    const item = Array.isArray(data) ? data[0] : data;

                    videoUrl =
                        item?.video?.noWatermark ||
                        item?.video?.no_watermark ||
                        item?.hd ||
                        item?.nowm ||
                        item?.play ||
                        item?.video_no_watermark ||
                        item?.url ||
                        (Array.isArray(item?.urls) && item.urls[0]) ||
                        helpers.extractMediaUrl(res);

                    thumbnail = thumbnail || item?.thumbnail || item?.cover || null;
                    title = title || item?.title || null;
                    durationSec = durationSec || item?.duration || null;
                    authorName =
                        (typeof item?.author === "string" && item.author) ||
                        item?.author?.nickname ||
                        item?.author?.name ||
                        item?.username ||
                        authorName;
                }

                if (!videoUrl) {
                    return reply(sock, jid, "❌ TikTok Downloader: could not extract video from this link. The link may be invalid, private, or the API changed its response format.", msg);
                }

                const detailsLines = [`🎵 *TikTok Downloader*`, ""];
                detailsLines.push(`👤 Author: ${authorName}`);
                if (title) detailsLines.push(`📝 Title: ${title.length > 200 ? title.slice(0, 200) + "…" : title}`);
                if (durationSec) detailsLines.push(`⏱️ Duration: ${durationSec}s`);
                detailsLines.push("", `_${CONFIG.botName}_`);

                try {
                    await helpers.sendDownloadResult(sock, jid, msg, {
                        thumbnail,
                        detailsText: detailsLines.join("\n"),
                        mediaType: "video",
                        mediaContent: { url: videoUrl },
                    });
                } catch (err) {
                    logger.error(`TikTok send error: ${err.message}`);
                    await reply(sock, jid, `❌ TikTok Downloader: video found but failed to send. Please try again later.`, msg);
                }

                } finally {
                    await helpers.stopLoading(sock, jid, __loading);
                }
                break;
            }

            case "song":
            case "play": {
                if (!text) {
                    return reply(sock, jid, `❗ Type a song name.\nExample: ${CONFIG.prefix}play alan walker faded`, msg);
                }
                await reply(sock, jid, `🔎 Searching: *${text}*...`, msg);

                // Music update: jaribu Song Download (apis.davidcyril.name.ng, mpya - haijathibitika kikamilifu)
                // kwanza, kisha Song Download v2 (davidcyriltech.my.id, iliyothibitika), kisha .play ya zamani
                let res;
                let usedFallback = false;
                try {
                    res = await api.dcSongDownloadV3(text);
                } catch (errV3) {
                    logger.warn(`[David Cyril API] Song Download (name.ng) failed, trying v2: ${errV3.message}`);
                    try {
                        res = await api.dcSongDownload(text);
                    } catch (err) {
                        logger.warn(`[David Cyril Tech API] Song Download v2 failed, falling back: ${err.message}`);
                        try {
                            res = await api.dcPlayMusic(text);
                            usedFallback = true;
                        } catch (err2) {
                            logger.error(`[David Cyril API] Play Music error: ${err2.message}`);
                            return reply(sock, jid, `❌ Play Music failed. Please try again later.`, msg);
                        }
                    }
                }

                const json = res?.data || res;
                const meta = json?.result || json?.data || json;
                const audioUrl = meta?.download_url || meta?.url || helpers.extractMediaUrl(json);

                if (!audioUrl) {
                    logger.error(`[Play] audio URL not found. Raw response: ${JSON.stringify(json).slice(0, 800)}`);
                    return reply(sock, jid, "❌ Play Music: could not find that song. Try a different name or add the artist.", msg);
                }

                const title = meta?.title || meta?.name || text;
                const artist = meta?.author || meta?.artist || meta?.channel || "Unknown Artist";
                const duration = meta?.duration || "--:--";

                // ---- Tech-style download progress card (visual only) ----
                // Tunakadiria "size" kutoka duration kama estimate ya haraka (~1MB/dakika kwa 128kbps)
                const durParts = String(duration).split(":").map(Number);
                const durSeconds = durParts.length === 2 ? durParts[0] * 60 + durParts[1] : 180;
                const estSizeMB = Math.max(1, Math.round((durSeconds / 60) * 1.15));

                function buildProgressBar(percent) {
                    const totalBars = 20;
                    const filled = Math.round((percent / 100) * totalBars);
                    const bar = "█".repeat(filled) + "░".repeat(totalBars - filled);
                    const speed = (1.8 + Math.random() * 1.4).toFixed(1);
                    return (
                        `⚡ *DOWNLOADING*\n\n` +
                        `🎵 ${title} - ${artist}\n` +
                        `📦 ${estSizeMB} MB  ⏱️ ${duration}\n\n` +
                        `${bar} ${percent}%\n` +
                        `⚡ ${speed} MB/s\n\n` +
                        `💠 .pause • .cancel • .status\n` +
                        `━━━━━━━━━━━━━━━━━━━━━\n` +
                        `🎧 BMW AUDIO CORE • ACTIVE`
                    );
                }

                let progressMsgKey = null;
                try {
                    const sent = await sock.sendMessage(jid, { text: buildProgressBar(28) }, { quoted: msg });
                    progressMsgKey = sent?.key || null;
                } catch (err) {
                    logger.warn(`Progress card send failed: ${err.message}`);
                }

                // Update mara 2 zaidi kuiga download inayoendelea (visual only - faili tayari lipo kwenye API)
                if (progressMsgKey) {
                    for (const percent of [64, 100]) {
                        await new Promise((r) => setTimeout(r, 550));
                        try {
                            await sock.sendMessage(jid, {
                                text: buildProgressBar(percent),
                                edit: progressMsgKey,
                            });
                        } catch (err) {
                            break; // edit isipofanya kazi (baadhi ya clients), tunaacha tu na kuendelea kutuma audio
                        }
                    }
                }

                await sock.sendMessage(jid, {
                    audio: { url: audioUrl },
                    mimetype: "audio/mpeg",
                    fileName: `${title}.mp3`,
                }, { quoted: msg }).catch(async (err) => {
                    logger.error(`[David Cyril API] Play send error: ${err.message}`);
                    await reply(sock, jid, `❌ Play Music: song found but failed to send. Please try again later.`, msg);
                });
                break;
            }

            case "livescore":
            case "livescores": {
                await reply(sock, jid, "⚽ Fetching live scores...", msg);

                let res;
                try {
                    res = await api.dcLiveScores();
                } catch (err) {
                    logger.error(`[David Cyril API] Live Scores error: ${err.message}`);
                    return reply(sock, jid, `❌ Live Scores failed. Please try again later.`, msg);
                }

                const json = res?.data || res;

                if (json?.success === false || json?.status === false) {
                    logger.error(`[David Cyril API] Live Scores returned failure. Raw: ${JSON.stringify(json).slice(0, 500)}`);
                    return reply(sock, jid, `❌ Live Scores: ${json?.message || "no data available right now"}`, msg);
                }

                const matches = json?.result || json?.data || json?.matches || (Array.isArray(json) ? json : []);

                if (!Array.isArray(matches) || matches.length === 0) {
                    return reply(sock, jid, "⚽ No live matches right now. Try again later.", msg);
                }

                let output = `⚽ *LIVE SCORES*\n\n`;
                matches.slice(0, 12).forEach((m) => {
                    const home = m?.homeTeam || m?.home || m?.team1 || "Home";
                    const away = m?.awayTeam || m?.away || m?.team2 || "Away";
                    const homeScore = m?.homeScore ?? m?.score1 ?? "-";
                    const awayScore = m?.awayScore ?? m?.score2 ?? "-";
                    const league = m?.league || m?.competition || "";
                    const status = m?.status || m?.time || m?.minute || "";

                    output += `${league ? `🏆 ${league}\n` : ""}${home} *${homeScore} - ${awayScore}* ${away}${status ? ` (${status})` : ""}\n\n`;
                });
                output += `_David Cyril API_`;

                await reply(sock, jid, output.trim(), msg);
                break;
            }

            case "livefootball": {
                await reply(
                    sock, jid,
                    `⚽ *LIVE FOOTBALL*\n\n` +
                    `Angalia mechi zote za moja kwa moja (live) hapa:\n` +
                    `🔗 https://bmw-sports.vercel.app\n\n` +
                    `_Powered by ${CONFIG.botName}_`,
                    msg
                );
                break;
            }

            case "fb": {
                const url = args[0];
                if (!url || !helpers.isUrl(url)) return reply(sock, jid, `❗ Send a valid URL. Example: ${CONFIG.prefix}fb https://www.facebook.com/share/r/xxxx`, msg);

                const __loading = helpers.startLoading(sock, jid, msg, {
                    frames: ["⬇️ Downloading Facebook video...", "📡 Fetching from source...", "🎞️ Almost there..."],
                });
                try {

                // Try CMNTY all-in-one downloader first (covers Facebook + most other platforms)
                try {
                    const sentByCmnty = await sendCmntyAio(sock, jid, msg, url);
                    if (sentByCmnty) {
                        break;
                    }
                } catch (err) {
                    logger.warn(`[CMNTY API] aiov3 failed for Facebook, falling back to Azbry: ${err.message}`);
                }

                // Jaribu Azbry API kwanza, ikishindwa rudi David Cyril (fallback)
                let videoUrl = null;
                let thumbnail = null;
                let fbTitle = "Facebook Video";
                let sizeLabel = null;

                try {
                    const azRes = await api.azbryFacebook(url);
                    if (azRes?.type === "video" && azRes.buffer) {
                        await sock.sendMessage(jid, {
                            video: azRes.buffer,
                            caption: `🎥 *Facebook Video*\n\n_${CONFIG.botName}_`,
                        }, { quoted: msg });
                        break;
                    }
                    // Muundo halisi wa Azbry: { result: { title, thumbnail, medias: [{url,quality,formattedSize}] } }
                    const azJson = azRes?.data || azRes;
                    const azData = azJson?.result || azJson?.data || azJson;
                    const medias = Array.isArray(azData?.medias) ? azData.medias : (Array.isArray(azData?.links) ? azData.links : []);
                    const hdMedia = medias.find((l) => (l.quality || "").toLowerCase().includes("hd"));
                    const bestMedia = hdMedia || medias[medias.length - 1] || medias[0];
                    videoUrl =
                        bestMedia?.url ||
                        azData?.hd || azData?.HD ||
                        azData?.sd || azData?.SD ||
                        azData?.url ||
                        helpers.extractMediaUrl(azJson);
                    thumbnail = azData?.thumbnail || azData?.thumb || null;
                    fbTitle = azData?.title || fbTitle;
                    sizeLabel = bestMedia?.formattedSize || null;
                } catch (err) {
                    logger.warn(`[Azbry API] Facebook failed, falling back to David Cyril: ${err.message}`);
                }

                if (!videoUrl) {
                    let res;
                    try {
                        res = await api.dcFacebook(url);
                    } catch (err) {
                        logger.error(`[David Cyril API] Facebook Video error: ${err.message}`);
                        return reply(sock, jid, `❌ Facebook Video Downloader failed. Please try again later.`, msg);
                    }

                    const json = res?.data || res;
                    const data = json?.result || json?.data || json;

                    videoUrl =
                        data?.hd || data?.HD ||
                        data?.sd || data?.SD ||
                        data?.url ||
                        (Array.isArray(data?.links) && (data.links.find(l => l.quality?.toLowerCase().includes("hd"))?.url || data.links[0]?.url)) ||
                        helpers.extractMediaUrl(json);
                    thumbnail = thumbnail || data?.thumbnail || data?.thumb || null;
                    fbTitle = fbTitle !== "Facebook Video" ? fbTitle : (data?.title || fbTitle);
                }

                if (!videoUrl) {
                    return reply(sock, jid, "❌ Facebook Video Downloader: could not extract video from this link. Make sure the video is public.", msg);
                }

                const detailsLines = [`🎥 *Facebook Video Downloader*`, "", `📝 Title: ${fbTitle}`];
                if (sizeLabel) detailsLines.push(`📦 Size: ${sizeLabel}`);
                detailsLines.push("", `_${CONFIG.botName}_`);

                try {
                    await helpers.sendDownloadResult(sock, jid, msg, {
                        thumbnail,
                        detailsText: detailsLines.join("\n"),
                        mediaType: "video",
                        mediaContent: { url: videoUrl },
                    });
                } catch (err) {
                    logger.error(`Facebook send error: ${err.message}`);
                    await reply(sock, jid, `❌ Facebook Video Downloader: video found but failed to send. Please try again later.`, msg);
                }

                } finally {
                    await helpers.stopLoading(sock, jid, __loading);
                }
                break;
            }

            case "ig":
            case "insta":
            case "instagram": {
                const url = args[0];
                if (!url || !helpers.isUrl(url)) return reply(sock, jid, `❗ Send a valid Instagram URL.\nExample: ${CONFIG.prefix}ig https://www.instagram.com/reel/xxxx`, msg);

                const __loading = helpers.startLoading(sock, jid, msg, {
                    frames: ["⬇️ Downloading Instagram media...", "📡 Fetching from source...", "🖼️ Almost there..."],
                });
                try {

                // Try CMNTY all-in-one downloader first (covers Instagram + most other platforms)
                try {
                    const sentByCmnty = await sendCmntyAio(sock, jid, msg, url);
                    if (sentByCmnty) {
                        break;
                    }
                } catch (err) {
                    logger.warn(`[CMNTY API] aiov3 failed for Instagram, falling back to Azbry: ${err.message}`);
                }

                // Jaribu Azbry API (instagramv2) kwanza, ikishindwa rudi Siputzx (fallback)
                let mediaUrls = [];
                let mediaType = "image"; // "video" | "image"
                let thumbnail = null;

                try {
                    const azRes = await api.azbryInstagram(url);
                    if (azRes?.type === "video" || azRes?.type === "image") {
                        // Content-type ilikuwa media moja kwa moja (hakuna JSON details)
                        await sock.sendMessage(jid, azRes.type === "video"
                            ? { video: azRes.buffer, caption: `📸 Instagram\n\n_${CONFIG.botName}_` }
                            : { image: azRes.buffer, caption: `📸 Instagram\n\n_${CONFIG.botName}_` },
                            { quoted: msg }
                        );
                        break;
                    }
                    // Muundo halisi wa Azbry: { type: "video"|"image", thumb, videos: [...], images: [...] }
                    const azJson = azRes?.data || azRes;
                    const azData = azJson?.result || azJson?.data || azJson;
                    thumbnail = azData?.thumb || azData?.thumbnail || null;
                    if (Array.isArray(azData?.videos) && azData.videos.length) {
                        mediaUrls = azData.videos.filter(Boolean);
                        mediaType = "video";
                    } else if (Array.isArray(azData?.images) && azData.images.length) {
                        mediaUrls = azData.images.filter(Boolean);
                        mediaType = "image";
                    }
                    if (!mediaUrls.length) {
                        const items = Array.isArray(azData) ? azData : (Array.isArray(azData?.data) ? azData.data : [azData]);
                        mediaUrls = items.map((it) => it?.url || it?.video || it?.download_url || it?.downloadUrl).filter(Boolean);
                    }
                    if (!mediaUrls.length) {
                        const fallback = helpers.extractMediaUrl(azJson);
                        if (fallback) mediaUrls.push(fallback);
                    }
                } catch (err) {
                    logger.warn(`[Azbry API] Instagram failed, falling back to Siputzx: ${err.message}`);
                }

                if (!mediaUrls.length) {
                    let res;
                    try {
                        res = await api.instagramDownload(url);
                    } catch (err) {
                        logger.error(`[Siputzx API] Instagram error: ${err.message}`);
                        return reply(sock, jid, `❌ Instagram Downloader failed. Please try again later.`, msg);
                    }

                    if (res && res.status === false) {
                        logger.error(`[Siputzx API] Instagram returned status:false. Raw: ${JSON.stringify(res).slice(0, 500)}`);
                        return reply(sock, jid, `❌ Instagram Downloader: ${res.message || "media not found or link invalid"}`, msg);
                    }

                    const data = res?.data || res?.result || res;
                    const items = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : [data]);

                    mediaUrls = items
                        .map((it) => it?.url || it?.video || it?.download_url || it?.downloadUrl)
                        .filter(Boolean);
                    mediaType = items.find((it) => it?.type === "video")?.type === "video" ? "video" : mediaType;

                    if (!mediaUrls.length) {
                        const fallback = helpers.extractMediaUrl(res);
                        if (fallback) mediaUrls.push(fallback);
                    }
                }

                if (!mediaUrls.length) {
                    return reply(sock, jid, "❌ Instagram Downloader: could not extract media from this link. Make sure the post is public.", msg);
                }

                const detailsLines = [`📸 *Instagram Downloader*`, "", `🗂️ Items: ${mediaUrls.length}`, "", `_${CONFIG.botName}_`];

                try {
                    if (thumbnail) {
                        await sock.sendMessage(jid, { image: { url: thumbnail }, caption: detailsLines.join("\n") }, { quoted: msg })
                            .catch(async () => {
                                await sock.sendMessage(jid, { text: detailsLines.join("\n") }, { quoted: msg }).catch(() => {});
                            });
                    } else {
                        await sock.sendMessage(jid, { text: detailsLines.join("\n") }, { quoted: msg }).catch(() => {});
                    }

                    for (const mediaUrl of mediaUrls.slice(0, 10)) {
                        const isVideo = mediaType === "video" || /\.mp4($|\?)/i.test(mediaUrl);
                        await sock.sendMessage(jid, isVideo
                            ? { video: { url: mediaUrl }, caption: `📸 Instagram\n\n_${CONFIG.botName}_` }
                            : { image: { url: mediaUrl }, caption: `📸 Instagram\n\n_${CONFIG.botName}_` },
                            { quoted: msg }
                        ).catch(() => {});
                    }
                } catch (err) {
                    logger.error(`Instagram send error: ${err.message}`);
                    await reply(sock, jid, `❌ Instagram Downloader: media found but failed to send. Please try again later.`, msg);
                }

                } finally {
                    await helpers.stopLoading(sock, jid, __loading);
                }
                break;
            }

            case "ytmp3": {
                const url = args[0];
                if (!url || !helpers.isUrl(url)) return reply(sock, jid, `❗ Send a valid YouTube URL.\nExample: ${CONFIG.prefix}ytmp3 https://youtu.be/xxxx`, msg);

                const __loading = helpers.startLoading(sock, jid, msg, {
                    frames: ["⬇️ Downloading YouTube audio...", "📡 Fetching from source...", "🎧 Almost there..."],
                });
                try {

                let audioUrl = null;
                let audioBuffer = null;
                let ytTitle = "YouTube Audio";
                let thumbnail = null;
                let channel = null;
                let durationSec = null;

                try {
                    const azRes = await api.azbryYtmp3(url);
                    if (azRes?.type === "audio" && azRes.buffer) {
                        audioBuffer = azRes.buffer;
                    } else {
                        // Muundo halisi wa Azbry: { result: { title, channel, thumbnail, duration, videoId, download, format } }
                        const azJson = azRes?.data || azRes;
                        const azData = azJson?.result || azJson?.data || azJson;
                        audioUrl = azData?.download || azData?.url || azData?.download_url || azData?.audio || helpers.extractMediaUrl(azJson);
                        ytTitle = azData?.title || ytTitle;
                        channel = azData?.channel && azData.channel !== "Unknown" ? azData.channel : null;
                        thumbnail = azData?.thumbnail || null;
                        durationSec = azData?.duration || null;
                    }
                } catch (err) {
                    logger.error(`[Azbry API] YouTube MP3 error: ${err.message}`);
                    return reply(sock, jid, `❌ YouTube Audio Downloader failed. Please try again later.`, msg);
                }

                if (!audioUrl && !audioBuffer) {
                    logger.error(`[Azbry API] YouTube MP3: audio URL not found`);
                    return reply(sock, jid, "❌ Azbry API (YouTube Audio Downloader): could not extract audio from this link.", msg);
                }

                const safeTitle = ytTitle.length > 200 ? ytTitle.slice(0, 200) + "…" : ytTitle;
                const detailsLines = [`🎧 *YouTube Audio Downloader*`, "", `📝 Title: ${safeTitle}`];
                if (channel) detailsLines.push(`📺 Channel: ${channel}`);
                if (durationSec) detailsLines.push(`⏱️ Duration: ${durationSec}s`);
                detailsLines.push("", `_${CONFIG.botName}_`);

                try {
                    await helpers.sendDownloadResult(sock, jid, msg, {
                        thumbnail,
                        detailsText: detailsLines.join("\n"),
                        mediaType: "audio",
                        mediaContent: audioBuffer ? audioBuffer : { url: audioUrl },
                        mimetype: "audio/mpeg",
                        fileName: `${safeTitle}.mp3`,
                    });
                } catch (err) {
                    logger.error(`YouTube MP3 send error: ${err.message}`);
                    await reply(sock, jid, `❌ YouTube Audio Downloader: audio found but failed to send. Please try again later.`, msg);
                }

                } finally {
                    await helpers.stopLoading(sock, jid, __loading);
                }
                break;
            }

            case "ytsmp4":
            case "ytmp4":
            case "ytdl": {
                const url = args[0];
                if (!url || !helpers.isUrl(url)) return reply(sock, jid, `❗ Send a valid YouTube URL.\nExample: ${CONFIG.prefix}ytsmp4 https://youtu.be/xxxx`, msg);

                const __loading2 = helpers.startLoading(sock, jid, msg, {
                    frames: ["⬇️ Downloading YouTube video...", "📡 Fetching from source...", "🎞️ Almost there..."],
                });
                try {

                let res;
                try {
                    res = await api.dcYoutubeMp4(url);
                } catch (err) {
                    logger.error(`YouTube API error: ${err.message}`);
                    return reply(sock, jid, `❌ YouTube video download failed. Please try again later.`, msg);
                }

                const json = res?.data || res;
                const meta = json?.result || json?.data || json;
                const videoUrl = meta?.url || helpers.extractMediaUrl(json);

                if (!videoUrl) {
                    logger.error(`YouTube: video URL not found. Raw response: ${JSON.stringify(json).slice(0, 800)}`);
                    return reply(sock, jid, "❌ Failed to get video (check terminal logs).", msg);
                }

                try {
                    await sock.sendMessage(jid, {
                        video: { url: videoUrl },
                        caption: `▶️ *${meta?.title || "YouTube Video"}*\n\n_${CONFIG.botName}_`,
                    }, { quoted: msg });
                } catch (err) {
                    logger.error(`YouTube send error: ${err.message}`);
                    await reply(sock, jid, `❌ Video found but failed to send. Please try again later.`, msg);
                }

                } finally {
                    await helpers.stopLoading(sock, jid, __loading2);
                }
                break;
            }

            case "img":
            case "imagine": {
                if (!text) return reply(sock, jid, `❗ Type an image prompt.\nExample: ${CONFIG.prefix}img a cute cat in space`, msg);

                const __loading = helpers.startLoading(sock, jid, msg, {
                    frames: ["🎨 Generating image...", "🧠 Rendering with AI...", "✨ Adding final touches..."],
                });
                try {

                let res;
                try {
                    res = await api.dcAnimagine(text);
                } catch (err) {
                    logger.error(`Image gen error: ${err.message}`);
                    return reply(sock, jid, `❌ Image generation failed. Please try again later.`, msg);
                }

                // API ikirudisha picha moja kwa moja
                if (res?.type === "image" && res.buffer) {
                    await sock.sendMessage(jid, {
                        image: res.buffer,
                        caption: `🎨 *${text}*\n\n_${CONFIG.botName}_`,
                    }, { quoted: msg });
                    break;
                }

                const json = res?.data || res;
                const imgUrl = json?.cdn_url || helpers.extractMediaUrl(json);
                if (!imgUrl) {
                    logger.error(`Image gen: URL not found. Raw response: ${JSON.stringify(json).slice(0, 800)}`);
                    return reply(sock, jid, "❌ Failed to generate image. Please try again later.", msg);
                }
                await sock.sendMessage(jid, {
                    image: { url: imgUrl },
                    caption: `🎨 *${text}*\n\n_${CONFIG.botName}_`,
                }, { quoted: msg });

                } finally {
                    await helpers.stopLoading(sock, jid, __loading);
                }
                break;
            }

            case "bible2": {
                if (!text) return reply(sock, jid, `❗ Send a Bible reference.\nExample: ${CONFIG.prefix}bible2 John 3:16`, msg);
                await reply(sock, jid, "📖 Looking up verse...", msg);

                let res;
                try {
                    res = await api.dcBible(text);
                } catch (err) {
                    logger.error(`Bible2 API error: ${err.message}`);
                    return reply(sock, jid, `❌ Bible lookup failed. Please try again later.`, msg);
                }

                const json = res?.data || res;
                if (!json || json.success === false || !json.text) {
                    return reply(sock, jid, `❌ ${json?.message || "Verse not found. Example: " + CONFIG.prefix + "bible2 John 3:16"}`, msg);
                }

                const verseText = String(json.text).trim();
                await reply(sock, jid, `📖 *${json.reference || text}* _(${json.translation || "WEB"})_\n\n${verseText}\n\n_${CONFIG.botName}_`, msg);
                break;
            }

            /* ===================== IMAGE PROCESSING ===================== */

            case "wanted":
            case "wasted": {
                // Accept: reply to image  OR  .wanted <image_url>
                const imgMsg = quoted?.imageMessage;
                let imgUrl = text || null;

                if (imgMsg) {
                    // Download quoted image → get its URL from directPath is unreliable,
                    // so we use the url field Baileys attaches
                    imgUrl = imgMsg.url || imgMsg.directPath || null;
                    // Fallback: try to extract from the quoted object
                    if (!imgUrl) imgUrl = helpers.extractMediaUrl(imgMsg);
                }

                if (!imgUrl) {
                    return reply(sock, jid,
                        `❗ Usage:\n` +
                        `• Reply to an image + *${CONFIG.prefix}${command}*\n` +
                        `• Or: *${CONFIG.prefix}${command}* [image_url]`,
                        msg
                    );
                }

                await reply(sock, jid, `🎨 Creating ${command} effect...`, msg);

                try {
                    let res;
                    try {
                        res = command === "wanted"
                            ? await api.nxWanted(imgUrl)
                            : await api.nxWasted(imgUrl);
                    } catch (nxErr) {
                        // Fallback: CMNTY API (maker/wasted) - "wanted" haipo kwenye CMNTY
                        if (command === "wasted") {
                            logger.warn(`[NX API] Wasted failed, falling back to CMNTY: ${nxErr.message}`);
                            res = await api.cmntyWasted(imgUrl);
                        } else {
                            throw nxErr;
                        }
                    }

                    if (res.type === "image" && res.buffer) {
                        await sock.sendMessage(jid, {
                            image: res.buffer,
                            caption: command === "wanted"
                                ? `🚨 *WANTED* — Dead or Alive\n\n_${CONFIG.botName}_`
                                : `💀 *WASTED*\n\n_${CONFIG.botName}_`,
                        }, { quoted: msg });
                    } else {
                        const url = helpers.extractMediaUrl(res?.data || res);
                        if (!url) {
                            logger.error(`${command}: no image in response: ${JSON.stringify(res).slice(0, 400)}`);
                            return reply(sock, jid, `❌ Failed to create ${command} image. Try again later.`, msg);
                        }
                        await sock.sendMessage(jid, {
                            image: { url },
                            caption: command === "wanted"
                                ? `🚨 *WANTED* — Dead or Alive\n\n_${CONFIG.botName}_`
                                : `💀 *WASTED*\n\n_${CONFIG.botName}_`,
                        }, { quoted: msg });
                    }
                } catch (err) {
                    logger.error(`${command} error: ${err.message}`);
                    await reply(sock, jid, `❌ ${command} failed. Please try again later.`, msg);
                }
                break;
            }

            case "emojimix": {
                // Usage: .emojimix 😉 😎  (two emojis separated by space)
                const parts = text ? text.trim().split(/\s+/) : [];
                const e1 = parts[0];
                const e2 = parts[1];

                if (!e1 || !e2) {
                    return reply(sock, jid,
                        `❗ Usage: *${CONFIG.prefix}emojimix* [emoji1] [emoji2]\n` +
                        `Example: ${CONFIG.prefix}emojimix 😉 😎`,
                        msg
                    );
                }

                await reply(sock, jid, `🎨 Mixing emojis...`, msg);

                try {
                    const q = `${e1} ${e2}`;
                    const res = await api.nxEmojiMix(q);

                    if (res.type === "image" && res.buffer) {
                        await sock.sendMessage(jid, {
                            image: res.buffer,
                            caption: `${e1} + ${e2} = ✨\n\n_${CONFIG.botName}_`,
                        }, { quoted: msg });
                    } else {
                        const imgUrl = res?.data?.url || res?.data?.image || helpers.extractMediaUrl(res?.data);
                        if (!imgUrl) {
                            logger.error(`emojimix: no image. Response: ${JSON.stringify(res).slice(0, 400)}`);
                            return reply(sock, jid, `❌ Failed to mix emojis. Try different emojis.`, msg);
                        }
                        await sock.sendMessage(jid, {
                            image: { url: imgUrl },
                            caption: `${e1} + ${e2} = ✨\n\n_${CONFIG.botName}_`,
                        }, { quoted: msg });
                    }
                } catch (err) {
                    logger.error(`emojimix error: ${err.message}`);
                    await reply(sock, jid, `❌ EmojiMix failed. Please try again later.`, msg);
                }
                break;
            }

            /* ===================== DOWNLOADER (Nexoracle) ===================== */

            case "gdrive": {
                const url = args[0];
                if (!url || !helpers.isUrl(url)) {
                    return reply(sock, jid,
                        `❗ Usage: *${CONFIG.prefix}gdrive* [Google Drive URL]\n` +
                        `Example: ${CONFIG.prefix}gdrive https://drive.google.com/file/d/xxxx/view`,
                        msg
                    );
                }

                await reply(sock, jid, "⬇️ Fetching Google Drive file...", msg);

                try {
                    const res = await api.nxGdrive(url);
                    const data = res?.data;

                    if (res.type === "video" && res.buffer) {
                        await sock.sendMessage(jid, {
                            video: res.buffer,
                            caption: `📁 Google Drive\n\n_${CONFIG.botName}_`,
                        }, { quoted: msg });
                        break;
                    }

                    // JSON response — extract download link
                    const dlUrl = data?.result?.downloadUrl || data?.result?.url
                        || data?.downloadUrl || data?.url
                        || helpers.extractMediaUrl(data);

                    if (!dlUrl) {
                        logger.error(`gdrive: no URL. Response: ${JSON.stringify(data).slice(0, 600)}`);
                        return reply(sock, jid, "❌ Could not get download link. Make sure the file is publicly shared.", msg);
                    }

                    const name = data?.result?.name || data?.name || "file";
                    const size = data?.result?.size || data?.size || "";

                    await reply(sock, jid,
                        `📁 *Google Drive Download*\n\n` +
                        `📄 File: ${name}\n` +
                        `${size ? `💾 Size: ${size}\n` : ""}` +
                        `🔗 Link: ${dlUrl}\n\n` +
                        `_${CONFIG.botName}_`,
                        msg
                    );
                } catch (err) {
                    logger.error(`gdrive error: ${err.message}`);
                    await reply(sock, jid, `❌ Google Drive failed. Please try again later.`, msg);
                }
                break;
            }

            case "tiktokslide":
            case "tiktokphoto": {
                const url = args[0];
                if (!url || !helpers.isUrl(url)) {
                    return reply(sock, jid,
                        `❗ Usage: *${CONFIG.prefix}tiktokslide* [TikTok photo/slideshow URL]\n` +
                        `Example: ${CONFIG.prefix}tiktokslide https://www.tiktok.com/@user/photo/xxx`,
                        msg
                    );
                }

                await reply(sock, jid, "⬇️ Downloading TikTok slideshow...", msg);

                try {
                    const res = await api.nxTiktokSlide(url);
                    const data = res?.data;

                    // Collect all image URLs from response
                    const images = data?.result?.images || data?.images || data?.photos || [];

                    if (!images.length) {
                        logger.error(`tiktokslide: no images. Response: ${JSON.stringify(data).slice(0, 600)}`);
                        return reply(sock, jid, "❌ No images found. Make sure the link is a TikTok slideshow/photo.", msg);
                    }

                    const title = data?.result?.title || data?.title || "TikTok Slideshow";
                    await reply(sock, jid, `🖼️ *${title}*\nSending ${images.length} image(s)...`, msg);

                    for (const imgUrl of images.slice(0, 10)) {
                        const url_ = typeof imgUrl === "string" ? imgUrl : imgUrl?.url || imgUrl?.image;
                        if (url_) {
                            await sock.sendMessage(jid, {
                                image: { url: url_ },
                                caption: `_${CONFIG.botName}_`,
                            }, { quoted: msg }).catch(() => {});
                        }
                    }
                } catch (err) {
                    logger.error(`tiktokslide error: ${err.message}`);
                    await reply(sock, jid, `❌ TikTok Slide failed. Please try again later.`, msg);
                }
                break;
            }

            /* ===================== TOOLS (Nexoracle) ===================== */

            case "shortlink":
            case "cuttly": {
                const url = args[0];
                if (!url || !helpers.isUrl(url)) {
                    return reply(sock, jid,
                        `❗ Usage: *${CONFIG.prefix}shortlink* [url]\n` +
                        `Example: ${CONFIG.prefix}shortlink https://github.com/example`,
                        msg
                    );
                }

                await reply(sock, jid, "🔗 Shortening URL...", msg);

                try {
                    const res = await api.nxShortlink(url);
                    const data = res?.data;

                    const short = data?.result?.shortUrl || data?.shortUrl || data?.url
                        || data?.result?.url || helpers.extractMediaUrl(data);

                    if (!short) {
                        logger.error(`shortlink: no URL. Response: ${JSON.stringify(data).slice(0, 400)}`);
                        return reply(sock, jid, "❌ Failed to shorten URL. Try again later.", msg);
                    }

                    await reply(sock, jid,
                        `🔗 *Short Link*\n\n` +
                        `📎 Original: ${url}\n` +
                        `✂️ Shortened: ${short}\n\n` +
                        `_${CONFIG.botName}_`,
                        msg
                    );
                } catch (err) {
                    logger.error(`shortlink error: ${err.message}`);
                    await reply(sock, jid, `❌ Shortlink failed. Please try again later.`, msg);
                }
                break;
            }

            /* ===================== MAKER ===================== */
            case "photooxy":
            case "ephoto":
            case "textpro": {
                if (!text) return reply(sock, jid, `❗ Example: ${CONFIG.prefix}${command} your-text`, msg);
                await reply(sock, jid, "🎨 Creating your image, please wait...", msg);

                let templateUrl, res;
                try {
                    if (command === "photooxy") {
                        templateUrl = "https://photooxy.com/logo-and-text-effects/shadow-text-effect-in-the-sky-394.html";
                        res = await api.photoOxy(templateUrl, text);
                    } else if (command === "ephoto") {
                        templateUrl = "https://en.ephoto360.com/create-a-cartoon-style-graffiti-text-effect-online-668.html";
                        res = await api.ephoto360(templateUrl, text);
                    } else {
                        templateUrl = "https://textpro.me/create-artistic-3d-text-effects-from-corn-kernels-1177.html";
                        res = await api.textPro(templateUrl, text);
                    }
                } catch (err) {
                    logger.error(`${command} API error: ${err.message}`);
                    return reply(sock, jid, `❌ Command failed. Please try again later.`, msg);
                }

                const imageUrl = helpers.extractMediaUrl(res);
                if (!imageUrl) {
                    logger.error(`${command}: image URL not found. Raw response: ${JSON.stringify(res).slice(0, 800)}`);
                    return reply(sock, jid, "❌ Failed to create image. Please try again later.", msg);
                }

                await sock.sendMessage(jid, {
                    image: { url: imageUrl },
                    caption: `🎨 *${command.toUpperCase()}*\n\n_${CONFIG.botName}_`,
                }, { quoted: msg });
                break;
            }

            /* ===================== SEARCH ===================== */
            case "gimg": {
                if (!text) return reply(sock, jid, `❗ Example: ${CONFIG.prefix}gimg cute cat`, msg);
                await reply(sock, jid, "🔎 Searching for images...", msg);
                const res = await api.googleImage(text);
                const data = res?.data || res;
                const list = Array.isArray(data) ? data : data?.images || [];
                if (!list.length) return reply(sock, jid, "❌ No images found.", msg);

                const top = list.slice(0, 5);
                for (const item of top) {
                    const imgUrl = item?.url || item?.image || item;
                    if (typeof imgUrl === "string") {
                        await sock.sendMessage(jid, { image: { url: imgUrl } }, { quoted: msg }).catch(() => {});
                    }
                }
                break;
            }

            case "yt": {
                if (!text) return reply(sock, jid, `❗ Example: ${CONFIG.prefix}yt how to code`, msg);
                await reply(sock, jid, "🔎 Searching YouTube...", msg);
                const res = await api.youtubeSearch(text);
                const data = res?.data || res;
                const list = Array.isArray(data) ? data : data?.videos || data?.result || [];
                if (!list.length) return reply(sock, jid, "❌ No results found.", msg);

                const top = list.slice(0, 8);
                let out = `🔎 *YouTube Results: ${text}*\n\n`;
                top.forEach((v, i) => {
                    out += `${i + 1}. *${v.title || v.name || "No title"}*\n`;
                    if (v.duration) out += `   ⏱️ ${v.duration}\n`;
                    if (v.views) out += `   👁️ ${v.views}\n`;
                    if (v.url || v.link) out += `   🔗 ${v.url || v.link}\n`;
                    out += `\n`;
                });
                await reply(sock, jid, out.trim(), msg);
                break;
            }

            /* ===================== TOOLS ===================== */
            case "country": {
                if (!text) return reply(sock, jid, `❗ Example: ${CONFIG.prefix}country Japan`, msg);
                await reply(sock, jid, "🌍 Searching country info...", msg);
                const res = await api.countryInfo(text);
                const data = res?.data || res;
                const d = Array.isArray(data) ? data[0] : data;
                if (!d) return reply(sock, jid, "❌ Country not found.", msg);

                let out = `🌍 *${d.name?.common || d.name || text}*\n\n`;
                if (d.capital) out += `🏛️ Capital: ${Array.isArray(d.capital) ? d.capital.join(", ") : d.capital}\n`;
                if (d.region) out += `📍 Region: ${d.region}\n`;
                if (d.subregion) out += `📍 Subregion: ${d.subregion}\n`;
                if (d.population) out += `👥 Population: ${d.population.toLocaleString?.() || d.population}\n`;
                if (d.area) out += `📐 Area: ${d.area} km²\n`;
                if (d.languages) out += `🗣️ Languages: ${typeof d.languages === "object" ? Object.values(d.languages).join(", ") : d.languages}\n`;
                if (d.currencies) out += `💰 Currencies: ${typeof d.currencies === "object" ? Object.values(d.currencies).map(c => c.name).join(", ") : d.currencies}\n`;
                if (d.flag || d.flags?.png) out += `\n🏳️ Flag: ${d.flag || d.flags?.png}\n`;

                await reply(sock, jid, out.trim(), msg);
                break;
            }

            case "ss": {
                // Inakubali: .ss <url>  AU  .ss web <url>
                const url = args.find((a) => helpers.isUrl(a));
                if (!url) return reply(sock, jid, `❗ Send a valid URL. Example: ${CONFIG.prefix}ss https://google.com`, msg);
                await reply(sock, jid, "📸 Taking website screenshot...", msg);

                let res;
                try {
                    res = await api.bintangSsweb(url);
                } catch (err) {
                    logger.error(`ss API error: ${err.message}`);
                    return reply(sock, jid, `❌ Command failed. Please try again later.`, msg);
                }

                // API ikirudisha picha moja kwa moja (binary)
                if (res?.type === "image" && res.buffer) {
                    await sock.sendMessage(jid, {
                        image: res.buffer,
                        caption: `📸 Screenshot of: ${url}\n\n_${CONFIG.botName}_`,
                    }, { quoted: msg });
                    break;
                }

                // API ikirudisha JSON yenye link
                const json = res?.data || res;
                const imgUrl = helpers.extractMediaUrl(json);
                if (!imgUrl) {
                    logger.error(`ss: image URL not found. Raw response: ${JSON.stringify(json).slice(0, 800)}`);
                    return reply(sock, jid, "❌ Failed to get screenshot.", msg);
                }
                await sock.sendMessage(jid, {
                    image: { url: imgUrl },
                    caption: `📸 Screenshot of: ${url}\n\n_${CONFIG.botName}_`,
                }, { quoted: msg });
                break;
            }

            case "ssweb": {
                const url = args[0];
                if (!url || !helpers.isUrl(url)) return reply(sock, jid, `❗ Send a valid URL. Example: ${CONFIG.prefix}ssweb https://google.com`, msg);
                await reply(sock, jid, "📸 Taking website screenshot...", msg);

                let res;
                try {
                    res = await api.websiteScreenshot(url, "desktop", "dark", false);
                } catch (err) {
                    logger.error(`ssweb API error: ${err.message}`);
                    return reply(sock, jid, `❌ Command failed. Please try again later.`, msg);
                }

                const imgUrl = helpers.extractMediaUrl(res);
                if (!imgUrl) {
                    logger.error(`ssweb: image URL not found. Raw response: ${JSON.stringify(res).slice(0, 800)}`);
                    return reply(sock, jid, "❌ Failed to get screenshot.", msg);
                }
                await sock.sendMessage(jid, {
                    image: { url: imgUrl },
                    caption: `📸 Screenshot of: ${url}\n\n_${CONFIG.botName}_`,
                }, { quoted: msg });
                break;
            }

            case "tts": {
                if (!text) return reply(sock, jid, `❗ Type text to convert to speech.\nExample: ${CONFIG.prefix}tts Hello world`, msg);
                await reply(sock, jid, "🔊 Converting text to speech...", msg);

                let res;
                try {
                    res = await api.dcTTS(text);
                } catch (err) {
                    logger.error(`TTS API error: ${err.message}`);
                    return reply(sock, jid, `❌ TTS failed. Please try again later.`, msg);
                }

                // API ikirudisha audio moja kwa moja
                if (res?.type === "audio" && res.buffer) {
                    await sock.sendMessage(jid, {
                        audio: res.buffer,
                        mimetype: "audio/mpeg",
                        ptt: true,
                    }, { quoted: msg });
                    break;
                }

                const json = res?.data || res;
                const audioUrl = json?.audioUrl || helpers.extractMediaUrl(json);
                if (!audioUrl) {
                    logger.error(`TTS: audio URL not found. Raw response: ${JSON.stringify(json).slice(0, 800)}`);
                    return reply(sock, jid, "❌ Failed to generate speech (check terminal logs).", msg);
                }
                await sock.sendMessage(jid, {
                    audio: { url: audioUrl },
                    mimetype: "audio/mpeg",
                    ptt: true,
                }, { quoted: msg });
                break;
            }

            case "pdfcrt":
            case "pdfcreate": {
                if (!text) return reply(sock, jid, `❗ Type text to turn into a PDF.\nExample: ${CONFIG.prefix}pdfcrt My document content`, msg);
                await reply(sock, jid, "📄 Creating PDF...", msg);

                let res;
                try {
                    res = await api.dcPdfCreate(text);
                } catch (err) {
                    logger.error(`PDF create error: ${err.message}`);
                    return reply(sock, jid, `❌ PDF generation failed. Please try again later.`, msg);
                }

                // API ikirudisha PDF moja kwa moja
                if ((res?.type === "pdf" || res?.type === "unknown") && res.buffer) {
                    await sock.sendMessage(jid, {
                        document: res.buffer,
                        mimetype: "application/pdf",
                        fileName: "document.pdf",
                    }, { quoted: msg });
                    break;
                }

                const json = res?.data || res;
                const pdfUrl = helpers.extractMediaUrl(json);
                if (!pdfUrl) {
                    logger.error(`PDF create: URL not found. Raw response: ${JSON.stringify(json).slice(0, 800)}`);
                    return reply(sock, jid, "❌ Failed to create PDF (check terminal logs).", msg);
                }
                await sock.sendMessage(jid, {
                    document: { url: pdfUrl },
                    mimetype: "application/pdf",
                    fileName: "document.pdf",
                }, { quoted: msg });
                break;
            }

            /* ===================== AFK ===================== */
            case "afk": {
                const reason = text || "No reason given";
                socialStore.setAfk(sender, reason);
                await reply(sock, jid, `😴 You're now AFK: _${reason}_\n\nI'll notify anyone who mentions or replies to you until you send another message.`, msg);
                break;
            }

            /* ===================== TOIMG - Convert sticker to image ===================== */
            case "toimg": {
                const stickerMsg = quoted?.stickerMessage || msg.message?.stickerMessage;

                if (!stickerMsg) {
                    return reply(sock, jid, `❗ Reply to a sticker with *${CONFIG.prefix}toimg* to convert it into an image.`, msg);
                }

                await reply(sock, jid, "🖼️ Converting sticker to image...", msg);

                try {
                    const sharp = require("sharp");
                    const stream = await downloadContentFromMessage(stickerMsg, "sticker");
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                    const isAnimated = stickerMsg.isAnimated;
                    if (isAnimated) {
                        return reply(sock, jid, "❌ Animated stickers can't be converted to a still image. Try a static (non-animated) sticker.", msg);
                    }

                    const pngBuffer = await sharp(buffer).png().toBuffer();

                    await sock.sendMessage(jid, {
                        image: pngBuffer,
                        caption: `🖼️ Converted!\n\n_${CONFIG.botName}_`,
                    }, { quoted: msg });
                } catch (err) {
                    logger.error(`.toimg error: ${err.message}`);
                    await reply(sock, jid, `❌ Failed to convert sticker. Please try again later.`, msg);
                }
                break;
            }

            /* ===================== REMINDER ===================== */
            case "remind":
            case "reminder": {
                if (args.length < 2) {
                    return reply(
                        sock, jid,
                        `❗ Example: ${CONFIG.prefix}remind 10 Drink water\n(reminds you in 10 minutes via DM)`,
                        msg
                    );
                }

                const minutes = parseFloat(args[0]);
                const reminderText = args.slice(1).join(" ");

                if (isNaN(minutes) || minutes <= 0) {
                    return reply(sock, jid, "❗ Please enter a valid number of minutes. Example: .remind 5 Call mom", msg);
                }
                if (minutes > 1440) {
                    return reply(sock, jid, "❗ Maximum reminder time is 1440 minutes (24 hours).", msg);
                }

                const ms = minutes * 60 * 1000;
                const remindTarget = sender; // always DM the person who set it, even if set inside a group

                setTimeout(async () => {
                    try {
                        await sock.sendMessage(remindTarget, {
                            text: `⏰ *Reminder!*\n\n${reminderText}\n\n_Set ${minutes} min ago via ${CONFIG.botName}_`,
                        });
                    } catch (err) {
                        logger.error(`Reminder delivery error: ${err.message}`);
                    }
                }, ms);

                const whenReadable = minutes >= 60
                    ? `${(minutes / 60).toFixed(1)} hour(s)`
                    : `${minutes} minute(s)`;

                await reply(sock, jid, `✅ Reminder set! I'll message you in ${whenReadable}.`, msg);
                break;
            }

            /* ===================== FACT & TRIVIA ===================== */
            case "fact": {
                const facts = CONFIG.randomFacts || [];
                if (!facts.length) return reply(sock, jid, "❌ No facts available right now.", msg);
                const fact = facts[Math.floor(Math.random() * facts.length)];
                await reply(sock, jid, `💡 *Did you know?*\n\n${fact}`, msg);
                break;
            }

            case "trivia": {
                let q, letters, correctIndex, correctText;
                letters = ["A", "B", "C", "D"];

                try {
                    // FEATURE: Trivia sasa inatumia David Cyril Trivia API (live)
                    const res = await api.dcTrivia(9, "easy");
                    const json = res?.data || res;
                    const item = json?.data?.[0];
                    if (!item) throw new Error("Hakuna swali lililorudi kutoka API.");

                    const allAnswers = item.all_answers?.length
                        ? item.all_answers
                        : [...item.incorrect_answers, item.correct_answer].sort(() => Math.random() - 0.5);

                    correctIndex = allAnswers.indexOf(item.correct_answer);
                    correctText = item.correct_answer;
                    q = { q: item.question, options: allAnswers };
                } catch (err) {
                    logger.warn(`Trivia API failed, using local fallback: ${err.message}`);
                    const questions = CONFIG.triviaQuestions || [];
                    if (!questions.length) return reply(sock, jid, "❌ No trivia questions available right now.", msg);
                    q = questions[Math.floor(Math.random() * questions.length)];
                    correctIndex = q.answer;
                    correctText = q.options[q.answer];
                }

                let output = `🧠 *TRIVIA TIME*\n\n${q.q}\n\n`;
                q.options.forEach((opt, i) => {
                    output += `${letters[i]}) ${opt}\n`;
                });
                output += `\n_Reply with the correct letter! Answer reveals in 15s..._`;

                await reply(sock, jid, output, msg);

                setTimeout(async () => {
                    try {
                        await sock.sendMessage(jid, {
                            text: `✅ *Answer:* ${letters[correctIndex]}) ${correctText}`,
                        });
                    } catch (err) {
                        logger.error(`Trivia answer send error: ${err.message}`);
                    }
                }, 15000);
                break;
            }

            /* ===================== SAVE - Save a replied WhatsApp Status ===================== */
            case "save": {
                if (!quoted) {
                    return reply(
                        sock, jid,
                        `❗ Reply to a WhatsApp Status (text, image, video, or voice note) with *${CONFIG.prefix}save* to save it.`,
                        msg
                    );
                }

                const imageMsg = quoted.imageMessage;
                const videoMsg = quoted.videoMessage;
                const audioMsg = quoted.audioMessage;
                const textContent = helpers.getMessageText({ message: quoted });

                // Tunatuma nakala kwa mtumaji binafsi (DM), sio kwenye group/chat ya sasa,
                // ili "kusave" isionekane hadharani mahali status ilipoletwa kutoka.
                const saveTarget = sender;

                try {
                    if (imageMsg) {
                        const stream = await downloadContentFromMessage(imageMsg, "image");
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                        await sock.sendMessage(saveTarget, {
                            image: buffer,
                            caption: imageMsg.caption || `💾 Saved Status\n\n_${CONFIG.botName}_`,
                        });
                    } else if (videoMsg) {
                        const stream = await downloadContentFromMessage(videoMsg, "video");
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                        await sock.sendMessage(saveTarget, {
                            video: buffer,
                            caption: videoMsg.caption || `💾 Saved Status\n\n_${CONFIG.botName}_`,
                        });
                    } else if (audioMsg) {
                        const stream = await downloadContentFromMessage(audioMsg, "audio");
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                        await sock.sendMessage(saveTarget, {
                            audio: buffer,
                            mimetype: audioMsg.mimetype || "audio/mpeg",
                            ptt: audioMsg.ptt || false,
                        });
                    } else if (textContent) {
                        await sock.sendMessage(saveTarget, {
                            text: `💾 *Saved Status*\n\n${textContent}\n\n_${CONFIG.botName}_`,
                        });
                    } else {
                        return reply(sock, jid, "❗ This type of status can't be saved yet (unsupported media type).", msg);
                    }

                    // Kama alitumia command kwenye group, mjulishe kwa DM tu badala ya kujibu hadharani
                    if (isGroup) {
                        await reply(sock, jid, "✅ Saved! Check your DM.", msg);
                    } else {
                        await reply(sock, jid, "✅ Status saved!", msg);
                    }
                } catch (err) {
                    logger.error(`.save error: ${err.message}`);
                    await reply(sock, jid, `❌ Failed to save status. Please try again later.`, msg);
                }
                break;
            }

            /* ===================== VIEW ONCE ===================== */
            case "vv": {
                await handleViewOnce(sock, jid, msg, quoted);
                break;
            }

            /* ===================== MEDIA CONVERTER ===================== */
            case "converter": {
                if (!quoted) {
                    return reply(
                        sock, jid,
                        `❗ Reply audio/video na uandike format unayotaka.\n\nMfano:\n${CONFIG.prefix}converter mp3 (reply audio/video)\n${CONFIG.prefix}converter ptt (reply audio - inakuwa voice note)\n${CONFIG.prefix}converter mp4 (reply video)`,
                        msg
                    );
                }

                const format = (args[0] || "").toLowerCase();
                if (!["mp3", "ptt", "mp4"].includes(format)) {
                    return reply(sock, jid, `❗ Format lazima iwe *mp3*, *ptt*, au *mp4*.`, msg);
                }

                const audioMsg = quoted.audioMessage;
                const videoMsg = quoted.videoMessage;
                if (!audioMsg && !videoMsg) {
                    return reply(sock, jid, "❗ Reply ujumbe wa audio au video.", msg);
                }

                await reply(sock, jid, "🔄 Nabadilisha format...", msg);

                try {
                    const converter = require("./lib/converter");
                    const srcMsg = audioMsg || videoMsg;
                    const stream = await downloadContentFromMessage(srcMsg, audioMsg ? "audio" : "video");
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                    const srcExt = (srcMsg.mimetype || "").split("/")[1]?.split(";")[0] || (audioMsg ? "ogg" : "mp4");

                    if (format === "mp3") {
                        const out = await converter.toAudio(buffer, srcExt);
                        await sock.sendMessage(jid, { audio: out, mimetype: "audio/mpeg" }, { quoted: msg });
                    } else if (format === "ptt") {
                        const out = await converter.toPTT(buffer, srcExt);
                        await sock.sendMessage(jid, { audio: out, mimetype: "audio/ogg; codecs=opus", ptt: true }, { quoted: msg });
                    } else if (format === "mp4") {
                        const out = await converter.toVideo(buffer, srcExt);
                        await sock.sendMessage(jid, { video: out, mimetype: "video/mp4" }, { quoted: msg });
                    }
                } catch (err) {
                    logger.error(`Converter error: ${err.message}`);
                    await reply(sock, jid, `❌ Imeshindwa kubadilisha (ffmpeg inahitajika kwenye server): ${err.message}`, msg);
                }
                break;
            }

            /* ===================== GET PROFILE PICTURE ===================== */
            case "getpp": {
                if (!isOwner) {
                    return reply(sock, jid, "😡 Command hii ni ya owner pekee.", msg);
                }

                let targetJid;
                const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
                if (mentioned?.length > 0) {
                    targetJid = mentioned[0];
                } else if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
                    targetJid = msg.message.extendedTextMessage.contextInfo.participant;
                }

                if (!targetJid) {
                    return reply(sock, jid, "❗ Tag mtu au reply ujumbe wake kupata profile picture yake.", msg);
                }

                try {
                    let profilePic;
                    try {
                        profilePic = await sock.profilePictureUrl(targetJid, "image");
                    } catch (_) {
                        return reply(sock, jid, "❌ Mtu huyu hana profile picture iliyowekwa.", msg);
                    }
                    await sock.sendMessage(jid, {
                        image: { url: profilePic },
                        caption: `📸 Profile picture ya @${targetJid.split("@")[0]}`,
                        mentions: [targetJid],
                    }, { quoted: msg });
                } catch (err) {
                    logger.error(`getpp error: ${err.message}`);
                    await reply(sock, jid, "❌ Imeshindwa kupata profile picture.", msg);
                }
                break;
            }

            /* ===================== GROUP STATUS ===================== */
            case "tosgroup": {
                if (!isOwner) return reply(sock, jid, "🚫 This command is owner only.", msg);
                if (!isGroup) return reply(sock, jid, "🚫 Command hii inafanya kazi ndani ya group tu.", msg);
                if (!quoted) return reply(sock, jid, `❗ Reply ujumbe (text/picha/video) unaotaka kuuweka kama status, kisha tuma ${CONFIG.prefix}tosgroup`, msg);

                try {
                    // Pata wanachama wote wa group hii ili wawe statusJidList (hao ndio
                    // watakaoweza kuona hii status kwenye "Status Updates" yao)
                    const metadata = await sock.groupMetadata(jid);
                    const statusJidList = metadata.participants
                        .map((p) => p.id)
                        .filter((id) => id !== sock.user?.id); // hatuhitaji kujituma wenyewe

                    if (!statusJidList.length) {
                        return reply(sock, jid, "❌ Imeshindwa kupata wanachama wa group hii.", msg);
                    }

                    const quotedText = helpers.getMessageText({ message: quoted });
                    const imageMsg = quoted.imageMessage;
                    const videoMsg = quoted.videoMessage;

                    const statusOptions = { statusJidList, broadcast: true };

                    if (imageMsg) {
                        const stream = await downloadContentFromMessage(imageMsg, "image");
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                        await sock.sendMessage(
                            "status@broadcast",
                            { image: buffer, caption: imageMsg.caption || "" },
                            statusOptions
                        );
                    } else if (videoMsg) {
                        const stream = await downloadContentFromMessage(videoMsg, "video");
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                        await sock.sendMessage(
                            "status@broadcast",
                            { video: buffer, caption: videoMsg.caption || "" },
                            statusOptions
                        );
                    } else if (quotedText) {
                        await sock.sendMessage(
                            "status@broadcast",
                            { text: quotedText },
                            statusOptions
                        );
                    } else {
                        return reply(sock, jid, "❗ Aina hii ya ujumbe haitumiki kwenye status (tumia text, picha, au video).", msg);
                    }

                    await reply(sock, jid, `✅ Status imewekwa kwa wanachama wote wa group hii (${statusJidList.length} watu).`, msg);
                } catch (err) {
                    logger.error(`tosgroup error: ${err.message}`);
                    await reply(sock, jid, `❌ Imeshindwa kuweka status. Jaribu tena baadaye.`, msg);
                }
                break;
            }

            /* ===================== MULTI-SESSION (.pairme) ===================== */
            case "pairme": {
                // lazy require - inaepuka circular dependency (sessionManager -> botManager -> commands)
                const sessionManager = require("./lib/sessionManager");

                const number = (args[0] || "").replace(/[^0-9]/g, "");
                if (!number) {
                    return reply(
                        sock,
                        jid,
                        `❗ Tuma namba yako ya WhatsApp pamoja na command.\nMfano: ${CONFIG.prefix}pairme 255712345678\n\n` +
                        `⚠️ Tumia namba TOFAUTI na ile uliyotumia hapa (sio ${sender.split("@")[0]}).`,
                        msg
                    );
                }

                await reply(sock, jid, "⏳ Naomba subiri, ninaanzisha session yako...", msg);

                const result = await sessionManager.createSession(number);
                if (!result.ok) {
                    return reply(sock, jid, `❌ ${result.error}`, msg);
                }

                if (result.code) {
                    await reply(
                        sock,
                        jid,
                        `✅ *Session yako imeanzishwa!*\n\n` +
                        `📱 Namba: ${number}\n` +
                        `🔑 Pairing Code: *${result.code}*\n\n` +
                        `👉 Fungua WhatsApp kwenye simu yenye namba *${number}* > Vifaa vilivyounganishwa > Unganisha kifaa kwa namba ya simu > ingiza code hapo juu.\n\n` +
                        `Mara ukiunganisha, utapata bot kamili (BMW LITE) kwenye namba yako, ukiwa owner wa session yako mwenyewe.`,
                        msg
                    );
                } else {
                    await reply(sock, jid, `✅ Session imeanzishwa. ${result.note || "Tuma .mysessions baada ya sekunde chache kuangalia pairing code."}`, msg);
                }
                break;
            }

            case "unpair": {
                const sessionManager = require("./lib/sessionManager");
                const ownNumber = sender.split("@")[0].replace(/[^0-9]/g, "");
                const targetArg = (args[0] || "").replace(/[^0-9]/g, "");

                // Mtu wa kawaida anaweza ku-unpair NAMBA YAKE MWENYEWE tu.
                // Owner wa msingi pekee anaweza ku-unpair namba ya mtu mwingine.
                let number;
                if (targetArg && targetArg !== ownNumber) {
                    if (!isOwner) {
                        return reply(sock, jid, "🚫 Unaweza ku-unpair namba yako mwenyewe tu.", msg);
                    }
                    number = targetArg;
                } else {
                    number = targetArg || ownNumber;
                }

                if (!sessionManager.isActive(number)) {
                    return reply(sock, jid, "❌ Hakuna session inayoendesha kwa namba hiyo.", msg);
                }

                await sessionManager.destroySession(number);
                await reply(sock, jid, `✅ Session ya ${number} imeondolewa kabisa.`, msg);
                break;
            }

            case "mysessions": {
                const sessionManager = require("./lib/sessionManager");

                if (!isOwner) {
                    return reply(sock, jid, "🚫 This command is owner only.", msg);
                }

                const sessions = sessionManager.listSessions();
                if (!sessions.length) {
                    return reply(sock, jid, `📭 Hakuna sessions zinazoendesha kwa sasa.\n(Kikomo: ${sessionManager.MAX_SESSIONS})`, msg);
                }

                const list = sessions
                    .map((s, i) => `${i + 1}. ${s.number} - ${s.status}`)
                    .join("\n");

                await reply(
                    sock,
                    jid,
                    `📊 *Sessions Zinazoendesha (${sessions.length}/${sessionManager.MAX_SESSIONS})*\n\n${list}`,
                    msg
                );
                break;
            }

            /* ===================== TRUST SYSTEM (OWNER) ===================== */
            case "trust": {
                if (!isOwner) return reply(sock, jid, "🚫 Command hii ni ya owner pekee.", msg);

                const feature = (args[0] || "").toLowerCase();
                if (!feature) {
                    return reply(sock, jid, `❗ Mfano: ${CONFIG.prefix}trust tiktok @mtu (au reply ujumbe wake)\nTumia *${CONFIG.prefix}trust all @mtu* kwa exemption ya commands zote.`, msg);
                }

                const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
                const targetJid = mentioned?.[0] || msg.message?.extendedTextMessage?.contextInfo?.participant;
                if (!targetJid) {
                    return reply(sock, jid, "❗ Tag mtu au reply ujumbe wake.", msg);
                }

                const featureKey = feature === "all" ? "*" : feature;
                const settingsNow = settingsManager.getSettings();
                const trustedUsers = { ...(settingsNow.trustedUsers || {}) };
                const current = trustedUsers[targetJid] || [];
                if (!current.includes(featureKey)) {
                    trustedUsers[targetJid] = [...current, featureKey];
                    settingsManager.setSetting("trustedUsers", trustedUsers);
                }

                await sock.sendMessage(jid, {
                    text: `✅ @${targetJid.split("@")[0]} sasa ana trust ya *${featureKey === "*" ? "commands zote" : featureKey}* (haipiti disabledCommands/cooldown).`,
                    mentions: [targetJid],
                }, { quoted: msg });
                break;
            }

            case "untrust": {
                if (!isOwner) return reply(sock, jid, "🚫 Command hii ni ya owner pekee.", msg);

                const feature = (args[0] || "").toLowerCase();
                const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
                const targetJid = mentioned?.[0] || msg.message?.extendedTextMessage?.contextInfo?.participant;
                if (!targetJid) {
                    return reply(sock, jid, "❗ Tag mtu au reply ujumbe wake.", msg);
                }

                const featureKey = feature === "all" ? "*" : feature;
                const settingsNow = settingsManager.getSettings();
                const trustedUsers = { ...(settingsNow.trustedUsers || {}) };
                if (!feature) {
                    delete trustedUsers[targetJid];
                } else {
                    trustedUsers[targetJid] = (trustedUsers[targetJid] || []).filter((f) => f !== featureKey);
                    if (trustedUsers[targetJid].length === 0) delete trustedUsers[targetJid];
                }
                settingsManager.setSetting("trustedUsers", trustedUsers);

                await sock.sendMessage(jid, {
                    text: `✅ Trust ya @${targetJid.split("@")[0]} imeondolewa${feature ? ` (${featureKey})` : " (yote)"}.`,
                    mentions: [targetJid],
                }, { quoted: msg });
                break;
            }

            case "listtrust": {
                if (!isOwner) return reply(sock, jid, "🚫 Command hii ni ya owner pekee.", msg);

                const trustedUsers = settingsManager.getSettings().trustedUsers || {};
                const entries = Object.entries(trustedUsers);
                if (entries.length === 0) {
                    return reply(sock, jid, "Hakuna mtu aliye-trust-iwa kwa sasa.", msg);
                }
                const list = entries.map(([j, feats]) => `• @${j.split("@")[0]} — ${feats.join(", ")}`).join("\n");
                await sock.sendMessage(jid, {
                    text: `👥 *Trusted Users*\n\n${list}`,
                    mentions: entries.map(([j]) => j),
                }, { quoted: msg });
                break;
            }

            /* ===================== SILENT LOG (OWNER) ===================== */
            case "silentlog": {
                if (!isOwner) return reply(sock, jid, "🚫 Command hii ni ya owner pekee.", msg);
                if (!isGroup) return reply(sock, jid, "❗ Command hii inatumika ndani ya group.", msg);

                const choice = (args[0] || "").toLowerCase();
                const settingsNow = settingsManager.getSettings();
                let silentList = [...(settingsNow.silentLogGroups || [])];

                if (choice === "all") {
                    silentList = silentList.includes("ALL_GROUPS") ? silentList.filter((g) => g !== "ALL_GROUPS") : [...silentList, "ALL_GROUPS"];
                    settingsManager.setSetting("silentLogGroups", silentList);
                    return reply(sock, jid, `✅ Silent log kwa *groups zote* sasa: ${silentList.includes("ALL_GROUPS") ? "IMEWASHWA" : "IMEZIMWA"}.`, msg);
                }

                if (silentList.includes(jid)) {
                    silentList = silentList.filter((g) => g !== jid);
                    settingsManager.setSetting("silentLogGroups", silentList);
                    await reply(sock, jid, "✅ Silent log IMEZIMWA kwa group hii.", msg);
                } else {
                    silentList.push(jid);
                    settingsManager.setSetting("silentLogGroups", silentList);
                    await reply(sock, jid, "✅ Silent log IMEWASHWA kwa group hii (commands hazitaonekana kwenye console logs).", msg);
                }
                break;
            }

            /* ===================== QWA - Fake Chat Screenshot ===================== */
            case "qwa": {
                if (!quoted) {
                    return reply(sock, jid, "❗ Reply ujumbe unaotaka kuufanya screenshot ya mazungumzo.", msg);
                }

                const __loading = helpers.startLoading(sock, jid, msg, { frames: ["📸 Natengeneza screenshot..."] });
                try {
                    const quotedParticipant = msg.message?.extendedTextMessage?.contextInfo?.participant || jid;
                    const quotedText = quoted.conversation || quoted.extendedTextMessage?.text || "";
                    let senderName = quotedParticipant.split("@")[0];
                    try {
                        const contact = await sock.onWhatsApp(quotedParticipant);
                        senderName = contact?.[0]?.notify || senderName;
                    } catch (_) { /* tupu - jina la namba linabaki */ }

                    let avatarUrl = null;
                    try {
                        avatarUrl = await sock.profilePictureUrl(quotedParticipant, "image");
                    } catch (_) { /* hana profile picture - inaruhusiwa */ }

                    const axios = require("axios");
                    const res = await axios.post("https://qwa.eeq.my.id/api/generate", {
                        messages: [{
                            name: senderName,
                            avatar: avatarUrl,
                            text: quotedText,
                            time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
                        }],
                    }, { timeout: 30000, responseType: "arraybuffer" });

                    await sock.sendMessage(jid, {
                        image: Buffer.from(res.data),
                        caption: "_⚡ POWERED BY BMW_",
                    }, { quoted: msg });
                } catch (err) {
                    logger.error(`qwa error: ${err.message}`);
                    await reply(sock, jid, `❌ Imeshindwa kutengeneza screenshot: ${err.message}`, msg);
                } finally {
                    await helpers.stopLoading(sock, jid, __loading);
                }
                break;
            }

            /* ===================== CEK DEVICE ===================== */
            case "cekdevice": {
                // Tunachunguza Message ID ya ujumbe uliyo-reply (kama ipo),
                // vinginevyo ujumbe wa sasa - prefix ya ID inaonyesha kifaa.
                const idToCheck = quoted && msg.message?.extendedTextMessage?.contextInfo?.stanzaId
                    ? msg.message.extendedTextMessage.contextInfo.stanzaId
                    : msg.key.id;

                let device = "Haijulikani";
                if (/^3EB0/.test(idToCheck)) device = "🌐 WhatsApp Web";
                else if (/^[0-9A-F]{20,}$/i.test(idToCheck) && idToCheck.length >= 32) device = "🤖 Android (Baileys/Bot)";
                else if (/^[A-F0-9]{18}$/i.test(idToCheck)) device = "📱 Android";
                else if (/^[A-F0-9-]{36}$/i.test(idToCheck)) device = "🍎 iPhone (iOS)";
                else device = "📱 Android/Business (haijathibitika 100%)";

                await reply(sock, jid, `📟 *Device Check*\n\nMessage ID: \`${idToCheck}\`\nKifaa (makadirio): ${device}\n\n_⚡ POWERED BY BMW_`, msg);
                break;
            }

            /* ===================== AUTO FEATURES (OWNER) ===================== */
            case "mode": {
                if (!isOwner) return reply(sock, jid, "🚫 This command is owner only.", msg);

                const choice = (args[0] || "").toLowerCase();
                const s = settingsManager.getSettings();

                if (choice !== "private" && choice !== "public") {
                    return reply(
                        sock,
                        jid,
                        `ℹ️ Mode ya sasa: *${s.mode || "public"}*\n\n` +
                        `Usage: ${CONFIG.prefix}mode private/public\n\n` +
                        `*private* = bot inafanya commands kwenye inbox (DM) tu\n` +
                        `*public* = bot inafanya commands kote (groups na inbox)`,
                        msg
                    );
                }

                settingsManager.setSetting("mode", choice);
                await reply(sock, jid, `✅ Mode imewekwa kuwa: *${choice}*`, msg);
                break;
            }

            case "autostatusview":
            case "autotyping":
            case "autorecord":
            case "autoreact":
            case "autoreactstatus":
            case "antilink":
            case "antidelete":
            case "channelbranding": {
                if (!isOwner) return reply(sock, jid, "🚫 This command is owner only.", msg);

                const keyMap = {
                    autostatusview: "autoStatusView",
                    autotyping: "autoTyping",
                    autorecord: "autoRecord",          // fake "recording audio" presence
                    autoreact: "autoReactMessages",   // react kila ujumbe unaoingia
                    autoreactstatus: "autoReactStatus", // react status za watu
                    antilink: "antiLink",
                    antidelete: "antiDelete",
                    channelbranding: "channelBranding", // "Forwarded from [channel]" tag kwenye ujumbe wote
                };
                const settingKey = keyMap[command];
                const choice = (args[0] || "").toLowerCase();

                if (choice !== "on" && choice !== "off") {
                    const cur = settingsManager.getSettings()[settingKey];
                    return reply(sock, jid, `ℹ️ ${command} is currently: ${helpers.onOff(cur)}\nUsage: ${CONFIG.prefix}${command} on/off`, msg);
                }

                settingsManager.setSetting(settingKey, choice === "on");
                await reply(sock, jid, `✅ ${command} is now set to: ${helpers.onOff(choice === "on")}`, msg);
                break;
            }

            default:
                // unknown command - stay silent
                break;
        }
    } catch (err) {
        logger.error(`Command Error [${command}]: ${err.message}`);

        // "No sessions" (and similar Signal/Baileys encryption errors) mean the bot
        // literally cannot deliver ANY message to this JID right now (broken/missing
        // encryption session). Trying to send an error reply will just fail again and
        // spam the logs with a second identical error, so skip it and let Baileys
        // self-heal the session on its own (usually resolves after a retry/reconnect).
        const sessionErrorPattern = /no session|session error|bad mac|failed to decrypt/i;
        if (sessionErrorPattern.test(err.message || "")) {
            logger.warn(`Skipping error reply to ${jid} — encryption session is broken (will self-heal).`);
            return;
        }

        await reply(sock, jid, `❌ Hitilafu imetokea. Jaribu tena baadaye.`, msg).catch((sendErr) => {
            logger.error(`Imeshindwa kutuma reply ya error kwa ${jid}: ${sendErr.message}`);
        });
    }
}

module.exports = { handleCommand, reactTo };
