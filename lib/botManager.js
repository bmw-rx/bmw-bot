/**
 * BMW LITE - Bot Manager
 * Hutenganisha logic ya kuanzisha/kusimamia connection ya Baileys
 * kutoka kwa index.js, ili iweze kutumika na index.js (CLI mode)
 * na dashboard.js (Web mode) kwa wakati mmoja.
 *
 * createBotInstance(options) - factory inayotengeneza "bot instance" huru
 * (sock, state, settings, owner yake) - hutumika na sessionManager.js kwa
 * multi-session (.pairme), na pia na owner bot ya msingi (backward compatible).
 */

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    delay,
    downloadContentFromMessage,
} = require("@whiskeysockets/baileys");
const { useSqliteAuthState } = require("./sqliteAuthState");

const pino = require("pino");
const fs = require("fs-extra");
const path = require("path");

const CONFIG = require("../config");
const logger = require("./logger");
const helpers = require("./helpers");
const store = require("./store");
const socialStore = require("./socialStore");
const settingsManagerGlobal = require("./settings");
const { handleCommand, reactTo } = require("../commands");

fs.ensureDirSync(CONFIG.sessionDir);
fs.ensureDirSync(CONFIG.dataDir);
fs.ensureDirSync(CONFIG.tempDir);

/**
 * FEATURE: Memory Watchdog
 * Hosting nyingi za bure (mfano KataBump free tier: 308 MB RAM) hu-"OOM-kill"
 * (kuua process kimya kimya) process ikizidi RAM iliyotengwa, kisha kuianzisha
 * upya - wakati wa hilo bot haipo mtandaoni na hakuna logi yoyote ya sababu.
 * Hii inaangalia RAM kila dakika 2 na kutoa ONYO kwenye logs (linaonekana
 * kwenye Live Logs Viewer ya dashboard) mapema kabla haijafika hapo, ili
 * uwahi kuchukua hatua (mfano: punguza sessions zinazofanya kazi kwa wakati
 * mmoja, au boresha package ya hosting) kabla ya kupoteza connection.
 * Weka RAM_LIMIT_MB kwenye environment variables kama limit yako ni tofauti.
 */
const RAM_LIMIT_MB = Number(process.env.RAM_LIMIT_MB) || 300; // default: KataBump free tier (~308MB)
const RAM_WARN_RATIO = 0.85;

setInterval(() => {
    const rssMB = process.memoryUsage().rss / 1024 / 1024;
    if (rssMB > RAM_LIMIT_MB * RAM_WARN_RATIO) {
        logger.warn(
            `🧠 Memory Watchdog: RAM inatumika ${rssMB.toFixed(0)}MB / ${RAM_LIMIT_MB}MB (${Math.round((rssMB / RAM_LIMIT_MB) * 100)}%). ` +
            `Ikizidi ${RAM_LIMIT_MB}MB, hosting yako inaweza kuua process (OOM) na bot "kulala" ghafla.`
        );
    }
}, 2 * 60 * 1000);

/**
 * FEATURE: Free-Tier Renewal Reminder
 * KataBump (na hosting nyingine za bure) huzima/hufuta server ambazo
 * hazijarenew kwa muda fulani (mfano: kila siku 4 kwa KataBump). Bot
 * "kulala" ghafla mara nyingi ni hii tu - server ilifutwa/imesimamishwa
 * kwa sababu haikurenew, si tatizo la code. Onyo hili linatokea mara moja
 * kila masaa 12 kwenye logs kukukumbusha kuangalia panel yako.
 */
setInterval(() => {
    logger.info(
        `⏰ Kumbuka: hosting za bure (KataBump n.k.) zinahitaji "renew" mara kwa mara - ` +
        `kama bot itatoweka ghafla bila error yoyote, angalia kwanza panel yako imesimamishwa kwa kutorenew.`
    );
}, 12 * 60 * 60 * 1000);

/**
 * Hutengeneza bot instance mpya, huru kabisa kutoka kwa nyingine.
 *
 * @param {object} options
 * @param {string} options.sessionDir - folder ya session ya Baileys (auth files)
 * @param {object} [options.settingsManager] - settings manager (kutoka settings.createSettingsManager)
 * @param {string} options.ownerNumber - namba ya owner WA HII session mahususi (bila +)
 * @param {string} [options.label] - jina la kutambulisha kwenye logs
 * @param {boolean} [options.sendOnlineMessage=true] - tuma ujumbe wa "Bot is Online" kwa owner mara ya kwanza
 * @param {boolean} [options.autoJoinChannel=true] - jiunge channel ya CONFIG.botChannel kiotomatiki
 * @param {function} [options.onLoggedOut] - callback inapotolewa nje kabisa (logged out)
 */
function createBotInstance(options) {
    const {
        sessionDir,
        settingsManager = settingsManagerGlobal.rawGlobalManager,
        ownerNumber = CONFIG.owner,
        label = ownerNumber,
        sendOnlineMessage = true,
        autoJoinChannel = true,
        onLoggedOut = null,
    } = options;

    fs.ensureDirSync(sessionDir);

    let sock = null;
    let isFirstConnection = true;
    let stopped = false;
    let lastActivityAt = Date.now();
    let watchdogTimer = null;
    let entryCloseAuthDb = null;
    let reconnectingViaWatchdog = false;

    // FEATURE: LID Resolver - WhatsApp inatuma baadhi ya mazungumzo kwa
    // muundo "@lid" (hidden ID, kuficha namba halisi) badala ya
    // "@s.whatsapp.net" ya kawaida. Baileys haiwezi kutengeneza session ya
    // usimbaji (encryption) kwa uhakika kwenye @lid, hivyo "No sessions" /
    // "encryption session is broken" errors zinatokea - hii ni tatizo la
    // maktaba ya Baileys yenyewe (linalofuatiliwa GitHub, si bug ya code
    // hii). Baileys inatoa event "chats.phoneNumberShare" ambayo mara nyingi
    // inatupatia ramani sahihi ya @lid -> namba halisi - tunaihifadhi na
    // kuibadilisha KABLA ya kupitisha ujumbe kwa command handler, ili reply
    // zote zitumwe kwa JID sahihi (@s.whatsapp.net) badala ya @lid iliyovunjika.
    const lidToRealJid = new Map();

    const state = {
        status: "disconnected",
        pairingCode: null,
        pairingNumber: null,
        lastError: null,
        connectedAt: null,
        qr: null,
        // FEATURE: Connected identity card (profile picture + display name),
        // populated once the socket opens - shown on the dashboard so the
        // user can visually confirm which WhatsApp account is linked.
        profileName: null,
        profilePicUrl: null,
    };

    function getState() {
        return { ...state };
    }

    function getSock() {
        return sock;
    }

    async function stop() {
        stopped = true;
        if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
        try {
            if (sock) await sock.logout().catch(() => {});
        } catch (_) { /* tupu kwa makusudi */ }
        try {
            if (sock?.ws) sock.ws.close();
        } catch (_) { /* tupu kwa makusudi */ }
        try {
            if (entryCloseAuthDb) entryCloseAuthDb();
        } catch (_) { /* tupu kwa makusudi */ }
    }

    /**
     * FEATURE: Connection Watchdog ("anti-sleep")
     * Baileys si mara zote hutoa "connection.update: close" pale socket
     * inapokufa kimya kimya (mfano mtandao kukatika ghafla bila TCP FIN sahihi -
     * socket inabaki "connected" kwenye state yetu lakini kwa uhalisia haipokei
     * wala kutuma chochote tena). Hii ndiyo sababu ya kawaida ya "bot inalala"
     * bila logi yoyote ya error. Watchdog hii inaangalia kila sekunde 45:
     *   1. Kama socket ya chini (WebSocket) haiko OPEN wakati state yetu
     *      inasema "connected" - reconnect ya kulazimishwa.
     *   2. Kama hakuna shughuli yoyote (ujumbe/connection event) kwa zaidi ya
     *      dakika 4 wakati "connected" - tuma presence ping ndogo kuthibitisha
     *      socket bado hai; ikishindwa, reconnect ya kulazimishwa.
     */
    function startWatchdog() {
        if (watchdogTimer) return;
        const WATCHDOG_INTERVAL_MS = 45 * 1000;
        const STALE_THRESHOLD_MS = 4 * 60 * 1000;

        watchdogTimer = setInterval(async () => {
            if (stopped || reconnectingViaWatchdog) return;
            if (state.status !== "connected" || !sock) return;

            const wsState = sock?.ws?.socket?.readyState ?? sock?.ws?.readyState;
            const wsIsOpen = wsState === undefined || wsState === 1; // undefined = library hides raw ws, assume ok, check via ping instead

            if (wsState !== undefined && !wsIsOpen) {
                logger.warn(`⚠️ [${label}] Watchdog: WebSocket haiko OPEN (state=${wsState}) - naunganisha upya...`);
                await forceReconnect();
                return;
            }

            const idleFor = Date.now() - lastActivityAt;
            if (idleFor > STALE_THRESHOLD_MS) {
                try {
                    await sock.sendPresenceUpdate("available");
                    lastActivityAt = Date.now(); // ping ilifanikiwa - socket bado hai
                } catch (err) {
                    logger.warn(`⚠️ [${label}] Watchdog: socket imekaa kimya dakika ${Math.round(idleFor / 60000)} na ping imeshindwa (${err.message}) - naunganisha upya...`);
                    await forceReconnect();
                }
            }
        }, WATCHDOG_INTERVAL_MS);
    }

    async function forceReconnect() {
        if (reconnectingViaWatchdog || stopped) return;
        reconnectingViaWatchdog = true;
        try {
            try { sock?.ws?.close(); } catch (_) { /* tupu */ }
            state.status = "disconnected";
            await startBot(state.pairingNumber);
        } finally {
            reconnectingViaWatchdog = false;
        }
    }

    async function startBot(phoneNumber = null, requestedCustomCode = null) {
        if (stopped) return null;

        state.status = "connecting";
        state.lastError = null;

        const { state: authState, saveCreds, close: closeAuthDb } = await useSqliteAuthState(
            path.join(sessionDir, "session.sqlite")
        );
        entryCloseAuthDb = closeAuthDb;

        sock = makeWASocket({
            logger: pino({ level: "silent" }),
            printQRInTerminal: false,
            auth: authState,
            browser: Browsers.ubuntu("Chrome"),
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
        });

        if (!sock.authState.creds.registered) {
            let number = (phoneNumber || CONFIG.pairingNumber || "").replace(/[^0-9]/g, "");

            if (number) {
                state.status = "waiting_for_code";
                state.pairingNumber = number;
                await delay(2000);
                try {
                    // Custom pairing code: mtumiaji anaweza kuchagua yake mwenyewe
                    // (requestedCustomCode - per-request, kutoka dashboard) - hii
                    // inapewa kipaumbele. Kama hakuna, tunatumia CONFIG.customPairingCode
                    // (branding chaguo-msingi, mfano "BMWLITE1"). Vyote viwili LAZIMA
                    // viwe herufi/namba 8 kwa jumla, uppercase, bila alama - vinginevyo
                    // Baileys itatengeneza code ya nasibu kama kawaida.
                    const rawRequested = (requestedCustomCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
                    const rawDefault = (CONFIG.customPairingCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
                    const customCode = rawRequested.length === 8 ? rawRequested : (rawDefault.length === 8 ? rawDefault : undefined);

                    const code = await sock.requestPairingCode(number, customCode);
                    const formatted = code?.match(/.{1,4}/g)?.join("-") || code;
                    state.pairingCode = formatted;
                    logger.success(`✅ [${label}] PAIRING CODE: ${formatted}`);
                    console.log(
                        `\n👉 [${label}] Fungua WhatsApp > Vifaa vilivyounganishwa > Unganisha kifaa kwa namba ya simu\n` +
                        "   kisha ingiza code hapo juu.\n"
                    );
                } catch (err) {
                    state.lastError = err.message;
                    logger.error(`[${label}] Imeshindwa kupata pairing code: ${err.message}`);
                }
            } else {
                state.status = "needs_number";
                logger.warn(`⚠️ [${label}] Hakuna namba iliyowekwa.`);
            }
        }

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === "close") {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                state.status = "disconnected";
                logger.warn(`[${label}] Connection imefungwa. Sababu: ${statusCode || "Haijulikani"}`);

                if (stopped) return;

                if (shouldReconnect) {
                    logger.info(`🔄 [${label}] Naunganisha tena...`);
                    setTimeout(() => startBot(state.pairingNumber), 3000);
                } else {
                    state.status = "logged_out";
                    state.profileName = null;
                    state.profilePicUrl = null;
                    logger.error(`🚪 [${label}] Umetolewa nje (logged out).`);
                    if (typeof onLoggedOut === "function") {
                        try { await onLoggedOut(); } catch (_) { /* tupu */ }
                    }
                }
            } else if (connection === "open") {
                state.status = "connected";
                state.connectedAt = Date.now();
                state.pairingCode = null;
                lastActivityAt = Date.now();
                startWatchdog();
                logger.success(`✅ [${label}] ${CONFIG.botName} imeunganishwa kikamilifu!`);

                // MUHIMU: WhatsApp huwa makini sana na vitendo vya "automatic"
                // (kujiunga channel, kutuma ujumbe) yanayofanyika papo hapo baada
                // ya kifaa kipya kuunganishwa (hasa pairing mpya) - hii mara nyingi
                // husababisha 401 (logged out) ndani ya sekunde chache. Tunasubiri
                // kidogo kwanza ili WhatsApp imalize "kuthibitisha" session mpya.
                const openedSock = sock;
                const stillConnected = () => !stopped && sock === openedSock && state.status === "connected";

                // FEATURE: Connected identity card - grab display name immediately
                // (already available on sock.user), and profile picture async
                // (network call - shouldn't block the connection flow if it's
                // slow or fails; guarded by stillConnected() so a stale response
                // from a since-replaced socket can't overwrite newer state).
                state.profileName = sock.user?.name || sock.user?.verifiedName || null;
                const jidForProfile = sock.user?.id || `${ownerNumber}@s.whatsapp.net`;
                sock.profilePictureUrl(jidForProfile, "image")
                    .then((url) => { if (stillConnected()) state.profilePicUrl = url; })
                    .catch(() => { if (stillConnected()) state.profilePicUrl = null; });

                setTimeout(async () => {
                    if (!stillConnected()) return;

                    const settingsNow = settingsManager.getSettings();
                    if (autoJoinChannel && (CONFIG.botChannelJid || CONFIG.botChannel) && !settingsNow.channelJoined) {
                        // FIX: "priming" + retry - baadhi ya matoleo ya Baileys
                        // yanahitaji newsletterMetadata() kwanza kabla
                        // newsletterFollow() haijafanya kazi kwa uhakika, hata
                        // kama tayari tunajua JID moja kwa moja. Tunajaribu
                        // mara 3 (na muda mfupi kati ya jaribio) kabla ya
                        // kuacha kabisa, ili kuepuka kushindwa kimya kwa tatizo
                        // la muda tu la mtandao.
                        for (let attempt = 1; attempt <= 3; attempt++) {
                            if (!stillConnected()) break;
                            try {
                                let channelJid = CONFIG.botChannelJid || null;
                                if (CONFIG.botChannel) {
                                    try {
                                        const inviteCode = CONFIG.botChannel.split("/").pop();
                                        const metadata = await openedSock.newsletterMetadata(
                                            channelJid ? "jid" : "invite",
                                            channelJid || inviteCode
                                        );
                                        channelJid = metadata?.id || channelJid;
                                    } catch (metaErr) {
                                        // "Priming" ikishindwa, bado tunajaribu newsletterFollow
                                        // moja kwa moja hapa chini kwa JID tuliyonayo tayari.
                                        logger.warn(`[${label}] newsletterMetadata priming imeshindwa (jaribio ${attempt}): ${metaErr.message}`);
                                    }
                                }

                                if (channelJid && stillConnected()) {
                                    await openedSock.newsletterFollow(channelJid);
                                    settingsManager.setSetting("channelJoined", true);
                                    logger.success(`📢 [${label}] Imejiunga channel kiotomatiki: ${channelJid}`);
                                    break;
                                }
                            } catch (err) {
                                logger.warn(`[${label}] Imeshindwa kujiunga channel (jaribio ${attempt}/3): ${err.message}`);
                                if (attempt < 3) await new Promise((r) => setTimeout(r, 3000));
                            }
                        }
                    }

                    if (isFirstConnection) {
                        isFirstConnection = false;
                        if (sendOnlineMessage && stillConnected()) {
                            try {
                                const ownerJid = `${ownerNumber}@s.whatsapp.net`;
                                const caption =
                                    CONFIG.onlineMessage(CONFIG.botName, CONFIG.version) +
                                    (CONFIG.botChannel ? `\n\n📢 Channel: ${CONFIG.botChannel}` : "");

                                if (CONFIG.botImage) {
                                    await openedSock.sendMessage(ownerJid, {
                                        image: { url: CONFIG.botImage },
                                        caption,
                                    }).catch(async (err) => {
                                        logger.warn(`[${label}] Imeshindwa kutuma picha, natuma text pekee: ${err.message}`);
                                        await openedSock.sendMessage(ownerJid, { text: caption });
                                    });
                                } else {
                                    await openedSock.sendMessage(ownerJid, { text: caption });
                                }
                            } catch (err) {
                                logger.error(`[${label}] Imeshindwa kutuma ujumbe kwa owner: ${err.message}`);
                            }
                        }
                    }
                }, CONFIG.postConnectGraceMs ?? 15000);
            }
        });

        // FEATURE: LID Resolver - hifadhi ramani ya @lid -> namba halisi
        // WhatsApp inapoichagua kuishare (si mara zote inapatikana, lakini
        // ikipatikana tunaitumia kuepuka session zilizovunjika za @lid).
        sock.ev.on("chats.phoneNumberShare", ({ lid, jid }) => {
            if (lid && jid) {
                lidToRealJid.set(lid, jid);
                logger.info(`[${label}] LID resolved: ${lid} -> ${jid}`);
            }
        });

        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            if (type !== "notify") return;
            lastActivityAt = Date.now();
            for (const msg of messages) {
                try {
                    await processMessage(sock, msg);
                } catch (err) {
                    logger.error(`[${label}] Message processing error: ${err.message}`);
                }
            }
        });

        sock.ev.on("messages.update", async (updates) => {
            const settings = settingsManager.getSettings();
            if (!settings.antiDelete) return;

            for (const update of updates) {
                try {
                    const isDeleted =
                        update.update?.message === null ||
                        update.update?.messageStubType === 1;

                    if (!isDeleted) continue;

                    const id = update.key?.id;
                    if (!id) continue;

                    const saved = store.getMessage(id);
                    if (!saved) continue;

                    const ownerJid = `${ownerNumber}@s.whatsapp.net`;
                    const caption =
                        `🗑️ *ANTI DELETE*\n\n` +
                        `👤 Sender: ${saved.sender}\n` +
                        `💬 Chat: ${saved.chatId}\n` +
                        `🕒 Muda: ${helpers.now()}\n\n` +
                        `📩 *Deleted message:*\n${saved.text || "(Media or text unavailable)"}`;

                    if (saved.mediaBuffer && saved.mediaType) {
                        await sock.sendMessage(ownerJid, {
                            [saved.mediaType]: saved.mediaBuffer,
                            caption,
                        });
                    } else {
                        await sock.sendMessage(ownerJid, { text: caption });
                    }

                    store.deleteMessage(id);
                } catch (err) {
                    logger.error(`[${label}] Anti-delete processing failed.`);
                }
            }
        });

        sock.ev.on("group-participants.update", async (event) => {
            try {
                const { id: groupId, participants, action } = event;
                const groupSettings = settingsManager.getGroupSettings(groupId);

                if (action !== "add" && action !== "remove") return;
                if (action === "add" && !groupSettings.welcome) return;
                if (action === "remove" && !groupSettings.goodbye) return;

                const metadata = await sock.groupMetadata(groupId);
                const groupName = metadata.subject || "Group";

                for (const participant of participants) {
                    const template = action === "add" ? groupSettings.welcomeMsg : groupSettings.goodbyeMsg;
                    const text = template
                        .replace(/@user/g, `@${participant.split("@")[0]}`)
                        .replace(/@group/g, groupName);

                    await sock.sendMessage(groupId, {
                        text,
                        mentions: [participant],
                    }).catch((err) => logger.error(`[${label}] Welcome/Goodbye send error: ${err.message}`));
                }
            } catch (err) {
                logger.error(`[${label}] group-participants.update error: ${err.message}`);
            }
        });

        return sock;
    }

    async function processMessage(sock, msg) {
        if (!msg.message) return;

        // FEATURE: LID Resolver - badilisha @lid kwenda namba halisi mapema
        // kabisa (kabla ya kitu kingine chochote), ili reply zote za command
        // (na hata majibu ya error) zitumwe kwa JID sahihi kwenye tukio hili
        // lote, si kwa @lid iliyovunjika. Ikiwa hatuna ramani bado kwa @lid
        // hii, tunaendelea nayo kama kawaida (haiathiri chochote kibaya).
        if (msg.key.remoteJid?.endsWith("@lid") && lidToRealJid.has(msg.key.remoteJid)) {
            const realJid = lidToRealJid.get(msg.key.remoteJid);
            msg.key.remoteJid = realJid;
            if (msg.key.participant?.endsWith("@lid") && lidToRealJid.has(msg.key.participant)) {
                msg.key.participant = lidToRealJid.get(msg.key.participant);
            }
        }

        const jid = msg.key.remoteJid;
        const isGroup = jid.endsWith("@g.us");
        const isStatus = jid === "status@broadcast";
        const settings = settingsManager.getSettings();
        const prefix = settings.prefix || CONFIG.prefix;

        if (isStatus) {
            if (settings.autoStatusView) {
                await sock.readMessages([msg.key]).catch(() => {});
            }
            if (settings.autoReactStatus && !msg.key.fromMe) {
                await reactTo(sock, jid, msg.key, CONFIG.statusReactEmoji);
            }
            return;
        }

        if (settings.autoRead && !msg.key.fromMe) {
            await sock.readMessages([msg.key]).catch(() => {});
        }

        if (settings.autoReactMessages && !msg.key.fromMe) {
            const emojis = CONFIG.autoReactEmojis || ["👍"];
            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            await reactTo(sock, jid, msg.key, randomEmoji);
        }

        if (settings.antiDelete && msg.key.id && !msg.key.fromMe) {
            const text = helpers.getMessageText(msg);
            const senderJid = msg.key.participant || msg.key.remoteJid;
            const senderName = msg.pushName || senderJid.split("@")[0];

            // Pata jina la chat linaloeleweka: jina la group (sio JID/@lid),
            // au jina la mtu binafsi kama ni DM.
            let chatName = senderName;
            if (isGroup) {
                try {
                    const metadata = await sock.groupMetadata(jid);
                    chatName = metadata?.subject || "Group";
                } catch (err) {
                    chatName = "Group";
                }
            }

            const saveData = {
                text,
                sender: senderName,
                chatId: chatName,
            };

            try {
                const imageMsg = msg.message.imageMessage;
                const videoMsg = msg.message.videoMessage;

                if (imageMsg || videoMsg) {
                    const type = imageMsg ? "image" : "video";
                    const stream = await downloadContentFromMessage(imageMsg || videoMsg, type);
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }
                    saveData.mediaBuffer = buffer;
                    saveData.mediaType = type;
                }
            } catch (err) {
                /* endelea na text tu */
            }

            store.saveMessage(msg.key.id, saveData);
        }

        if (isGroup && !msg.key.fromMe) {
            const groupAntiLinkOn = settings.antiLink || settingsManager.isGroupAntiLinkOn(jid);
            if (groupAntiLinkOn) {
                const text = helpers.getMessageText(msg);
                if (helpers.containsLink(text)) {
                    try {
                        const metadata = await sock.groupMetadata(jid);
                        const senderJid = msg.key.participant || msg.key.remoteJid;
                        const isAdmin = helpers.isGroupAdmin(metadata, senderJid);
                        const senderIsOwner = helpers.isOwnerNumber(senderJid, ownerNumber) || msg.key.fromMe;
                        const botJid = sock.user?.id || `${ownerNumber}@s.whatsapp.net`;
                        const isBotAdmin = helpers.isGroupAdmin(metadata, botJid);

                        if (!isAdmin && !senderIsOwner && isBotAdmin) {
                            await sock.sendMessage(jid, { delete: msg.key });
                            await sock.sendMessage(jid, {
                                text: `🚫 @${senderJid.split("@")[0]} links are not allowed here. The message was deleted.`,
                                mentions: [senderJid],
                            });
                        }
                    } catch (err) {
                        logger.error(`[${label}] Anti-link error: ${err.message}`);
                    }
                }
            }
        }

        // ---- ANTI MENTION-GROUP: mtu aki-tag/mention watu wengi mno kwa mara moja ----
        // (yaani anajaribu ku-tag group nzima), tunahesabu tukio hilo. Akifanya
        // hivi mara ya tatu (au CONFIG.maxGroupMentionWarnings), anapewa warning
        // na - kama bot ni admin - anaondolewa kwenye group kiotomatiki.
        if (isGroup && !msg.key.fromMe) {
            const groupAntiMentionOn = settingsManager.isGroupAntiMentionOn(jid);
            if (groupAntiMentionOn) {
                // ---- Status-mention notification: "X's status - @ This group was mentioned" ----
                // Hii ni ujumbe unaotokea ndani ya group pale mtu anapo-tag/mention group hii
                // kwenye status/story yake (WhatsApp huweka field "groupMentionedMessage" kwenye
                // ujumbe huo). Tunaifuta moja kwa moja (bila warning/kick - ni taarifa tu, si
                // spam ya kawaida ya ku-tag watu wengi kwa ujumbe mmoja) na kutunza counter
                // ili ionekane bot inafanya kazi (update ya idadi iliyofutwa).
                if (msg.message?.groupMentionedMessage) {
                    logger.info(`[${label}] Anti-mention: status-mention notification detected in ${jid}`);
                    try {
                        const metadata = await sock.groupMetadata(jid);
                        const botJid = sock.user?.id || "";
                        const isBotAdmin = helpers.isGroupAdmin(metadata, botJid);
                        if (isBotAdmin) {
                            await sock.sendMessage(jid, { delete: msg.key });
                            const total = socialStore.incrementStatusMentionDeleted(jid);
                            logger.info(`[${label}] Anti-mention: deleted status-mention notification in ${jid} (total: ${total})`);
                        } else {
                            logger.warn(`[${label}] Anti-mention: cannot delete status-mention notification in ${jid} - bot is not admin`);
                        }
                    } catch (err) {
                        logger.error(`[${label}] Anti-mention status-mention error: ${err.message}`);
                    }
                    // Notification hii haihitaji kuchakatwa zaidi (si ujumbe wa kawaida)
                    return;
                }

                try {
                    const mentionedJids = helpers.getAllMentionedJids(msg);
                    const minMentions = CONFIG.minMentionsForGroupTag || 5;

                    if (mentionedJids.length >= minMentions) {
                        const senderJid = msg.key.participant || msg.key.remoteJid;
                        const metadata = await sock.groupMetadata(jid);
                        const isAdmin = helpers.isGroupAdmin(metadata, senderJid);
                        const senderIsOwner = helpers.isOwnerNumber(senderJid, ownerNumber);

                        // Admin/owner wanaruhusiwa ku-tag group nzima (mfano kwa tangazo muhimu)
                        if (!isAdmin && !senderIsOwner) {
                            // Futa ujumbe uliotumika ku-tag group nzima (kama antilink)
                            const botJidForDelete = sock.user?.id || "";
                            const isBotAdminForDelete = helpers.isGroupAdmin(metadata, botJidForDelete);
                            if (isBotAdminForDelete) {
                                await sock.sendMessage(jid, { delete: msg.key }).catch((err) => {
                                    logger.error(`[${label}] Anti-mention-group delete error: ${err.message}`);
                                });
                            }

                            const count = socialStore.addMentionGroupWarning(jid, senderJid);
                            const max = CONFIG.maxGroupMentionWarnings || 3;

                            if (count >= max) {
                                socialStore.resetMentionGroupWarnings(jid, senderJid);

                                const botJid = sock.user?.id || "";
                                const isBotAdmin = helpers.isGroupAdmin(metadata, botJid);

                                if (isBotAdmin) {
                                    await sock.sendMessage(jid, {
                                        text: `🚫 @${senderJid.split("@")[0]} amefikisha ${count}/${max} kwa ku-tag group nzima mara kwa mara na ametolewa.`,
                                        mentions: [senderJid],
                                    });
                                    await sock.groupParticipantsUpdate(jid, [senderJid], "remove").catch((err) => {
                                        logger.error(`[${label}] Anti-mention-group kick error: ${err.message}`);
                                    });
                                } else {
                                    await sock.sendMessage(jid, {
                                        text: `⚠️ @${senderJid.split("@")[0]} amefikisha ${count}/${max} kwa ku-tag group nzima, lakini bot si admin hivyo haiwezi kumtoa.`,
                                        mentions: [senderJid],
                                    });
                                }
                            } else {
                                await sock.sendMessage(jid, {
                                    text: `⚠️ @${senderJid.split("@")[0]} tafadhali usi-tag group nzima mara kwa mara! Onyo (${count}/${max}).`,
                                    mentions: [senderJid],
                                });
                            }
                        }
                    }
                } catch (err) {
                    logger.error(`[${label}] Anti-mention-group error: ${err.message}`);
                }
            }
        }

        if (!msg.key.fromMe) {
            const presence = settings.autoRecord ? "recording" : settings.autoTyping ? "composing" : null;
            if (presence) {
                await sock.sendPresenceUpdate(presence, jid).catch(() => {});
                setTimeout(() => {
                    if (!stopped && sock && state.status === "connected") {
                        sock.sendPresenceUpdate("paused", jid).catch(() => {});
                    }
                }, 2500);
            }
        }

        const text = helpers.getMessageText(msg).trim();

        // Kama ujumbe huu ni command ya .afk yenyewe, usiifute AFK hapa - acha
        // handleCommand ndio iweke AFK mpya (vinginevyo "welcome back" ingetumwa
        // mara moja kabla ya AFK mpya kuwekwa, na kukanganya mtumiaji).
        const isAfkCommandItself = text.startsWith(prefix) && text.slice(prefix.length).trim().split(/\s+/)[0]?.toLowerCase() === "afk";

        // ---- AFK: clear status ya mtumaji mwenyewe akitoa ujumbe wowote (isipokuwa .afk yenyewe) ----
        if (!msg.key.fromMe && text && !isAfkCommandItself) {
            const socialStore = require("./socialStore");
            const senderJidForAfk = msg.key.participant || msg.key.remoteJid;
            const wasAfk = socialStore.getAfk(senderJidForAfk);
            if (wasAfk) {
                socialStore.clearAfk(senderJidForAfk);
                const since = helpers.uptime(Math.floor((Date.now() - wasAfk.since) / 1000));
                await sock.sendMessage(jid, {
                    text: `👋 Welcome back @${senderJidForAfk.split("@")[0]}! I've removed your AFK status (was AFK for ${since}).`,
                    mentions: [senderJidForAfk],
                }).catch(() => {});
            }
        }

        // ---- AFK: mjulishe mtu akimtaja/kum-reply mtu aliyeko AFK ----
        if (!msg.key.fromMe && text) {
            const socialStore = require("./socialStore");
            const senderJidForAfk = msg.key.participant || msg.key.remoteJid;
            const mentioned = helpers.getAllMentionedJids(msg);
            const quotedJid = helpers.getMentionedOrQuotedJid(msg);
            const candidates = [...new Set([...mentioned, quotedJid].filter(Boolean))]
                .filter((j) => j !== senderJidForAfk); // usimjulishe mtu kuhusu AFK yake mwenyewe

            for (const candidateJid of candidates) {
                const afkInfo = socialStore.getAfk(candidateJid);
                if (afkInfo) {
                    const since = helpers.uptime(Math.floor((Date.now() - afkInfo.since) / 1000));
                    await sock.sendMessage(jid, {
                        text: `💤 @${candidateJid.split("@")[0]} is currently AFK: _${afkInfo.reason}_\n(AFK for ${since})`,
                        mentions: [candidateJid],
                    }, { quoted: msg }).catch(() => {});
                }
            }
        }

        if (settings.chatbotMode && !isGroup && !msg.key.fromMe && text && !text.startsWith(prefix)) {
            try {
                const api = require("./api");
                const systemPrompt = settings.aiSystemPrompt || "You are a helpful assistant.";
                // Chatbot Mode sasa inatumia Groq/OpenRouter (funguo zako halisi za
                // API), ikirudi kwenye duckAI ya bure endapo hakuna funguo iliyowekwa.
                let answer;
                try {
                    const res = await api.aiChat(text, systemPrompt);
                    answer = res.answer;
                } catch (aiErr) {
                    const fallback = await api.duckAI(text, "gpt-4o-mini", systemPrompt);
                    answer = helpers.extractText(fallback);
                }
                if (answer) {
                    await sock.sendMessage(jid, { text: answer }, { quoted: msg });
                }
            } catch (err) {
                logger.error(`[${label}] Chatbot mode error: ${err.message}`);
            }
            return;
        }

        if (!text.startsWith(prefix)) return;

        const withoutPrefix = text.slice(prefix.length).trim();
        if (!withoutPrefix) return;

        const args = withoutPrefix.split(/\s+/);
        const command = args.shift().toLowerCase();
        const argsText = args.join(" ");

        const senderJid = msg.key.participant || msg.key.remoteJid;
        const senderIsOwner = msg.key.fromMe || helpers.isOwnerNumber(senderJid, ownerNumber);

        if (settings.mode === "private" && isGroup && !senderIsOwner) {
            return;
        }

        // "Context swap": tunabadilisha CONFIG.owner kwa muda mfupi kuwa owner
        // WA SESSION HII (sio owner wa msingi), na tunaelekeza settingsManager
        // "active" iwe ya session hii - ili commands za owner-only (.mode,
        // .autoreact, n.k) zilizoandikwa kwa CONFIG.owner zifanye kazi sahihi
        // kwa kila session bila kuandika commands.js/groupCommands.js upya.
        const prevOwner = CONFIG.owner;
        CONFIG.owner = ownerNumber;
        settingsManagerGlobal.setActiveManager(settingsManager);
        try {
            await handleCommand(sock, msg, command, args, argsText);
        } finally {
            CONFIG.owner = prevOwner;
            settingsManagerGlobal.useDefaultManager();
        }
    }

    return {
        startBot,
        getState,
        getSock,
        stop,
        sessionDir,
        ownerNumber,
        label,
    };
}

// ---- OWNER BOT (singleton ya zamani) - 100% backward compatible ----
const ownerInstance = createBotInstance({
    sessionDir: CONFIG.sessionDir,
    settingsManager: settingsManagerGlobal.rawGlobalManager,
    ownerNumber: CONFIG.owner,
    label: "OWNER",
});

module.exports = {
    startBot: ownerInstance.startBot,
    getState: ownerInstance.getState,
    getSock: ownerInstance.getSock,
    logout: ownerInstance.stop,
    createBotInstance,
};
