/**
 * BMW LITE - Settings Manager
 * Hutunza hali (on/off) ya auto features, group-specific settings
 * (welcome/goodbye/antilink), na dynamic config (prefix, botName)
 * kwenye data/settings.json ili zibaki hata bot ikianzishwa upya.
 *
 * createSettingsManager(filePath) - factory inayotumika kwa multi-session
 * (kila session ina settings.json yake binafsi, tofauti na ya owner).
 * Default export bado ni "global instance" ya zamani (data/settings.json)
 * ili kodi iliyokuwepo (commands.js, n.k) isiathirike - 100% backward compatible.
 */

const fs = require("fs-extra");
const path = require("path");
const CONFIG = require("../config");

// Usajili wa "managers halali" - kila settings manager halisi (iliyotengenezwa
// na createSettingsManager, ikiwa ni pamoja na globalManager) hujisajili hapa.
// setActiveManager() (chini ya faili hii) inakataa kitu chochote kisicho kwenye
// usajili huu - hii inazuia kabisa uwezekano wa "proxy" ya module.exports
// (ambayo ni object tofauti baada ya spread) kupitishwa kimakosa kama active
// manager, jambo lililokuwa likisababisha infinite recursion.
const validManagers = new WeakSet();

function defaultSettings() {
    return {
        // Global auto features
        ...CONFIG.autoFeatures,

        // Dynamic config (zinazoweza kubadilishwa kwa command bila kuhariri config.js)
        prefix: CONFIG.prefix,
        botName: CONFIG.botName,
        chatbotMode: false, // true = bot inajibu kila ujumbe wa private chat kwa AI
        autoRead: false,    // soma (blue tick) ujumbe wote kiotomatiki

        // "private" = commands zinafanya kazi kwenye inbox (DM) tu, bot inapuuza commands kwenye groups
        // "public" = commands zinafanya kazi kote (groups na inbox)
        mode: "public",

        // Auto React: bot ina-react kila ujumbe unaoingia kwa emoji random kutoka CONFIG.autoReactEmojis
        autoReactMessages: false,

        // Imewahi kujiunga channel ya bot kiotomatiki (huwekwa true mara moja tu, baada ya connection ya kwanza)
        channelJoined: false,

        // Anti-link kwa groups (orodha ya group ID zenye antilink imewashwa)
        antiLinkGroups: [],

        // Anti Mention-Group kwa groups (orodha ya group ID zenye feature hii imewashwa) -
        // mtu aki-tag group nzima (@mentions nyingi mno) mara kadhaa, hupewa warning/kutolewa.
        antiMentionGroups: [],

        // Per-group settings: { [groupId]: { welcome: bool, goodbye: bool, welcomeMsg, goodbyeMsg } }
        groups: {},

        // --- FEATURE 6: Command Toggle Panel ---
        // Orodha ya commands zilizozimwa (array ya majina, mfano ["tiktok","ig"]).
        // Command iliyomo humu inapuuzwa kabisa na handleCommand().
        disabledCommands: [],

        // --- FEATURE 9: Custom Welcome/Goodbye (default ya jumla, kabla
        // ya per-group override kwenye settings.groups[groupId]) ---
        defaultWelcomeMsg: "👋 Karibu @user kwenye *@group*!\nUsome kanuni za group kabla ya kuchat.",
        defaultGoodbyeMsg: "👋 @user ametuacha. Kwaheri!",

        // --- FEATURE 12: AI Personality Editor ---
        // System prompt inayotumika na Chatbot Mode (duckAI). Mtu anaweza
        // kuibadilisha kwenye dashboard bila kuhariri code.
        aiSystemPrompt: "You are a helpful assistant.",

        // --- BONUS FEATURE: Command Cooldown / Rate Limiter ---
        // { [commandName]: seconds }. Command isiyo hapa haina cooldown.
        commandCooldowns: {},

        // --- FEATURE: Trust System ---
        // { [jid]: [featureName1, featureName2, ...] } - mtumiaji aliyeko
        // hapa anapuuzwa na disabledCommands/cooldown kwa feature husika tu
        // (si owner-level access kamili, ni exemption ya feature moja moja).
        trustedUsers: {},

        // --- FEATURE: Silent Log ---
        // Orodha ya group JIDs ambazo logger.cmd() haipaswi kuandika command
        // logs kwa ajili yao. Thamani maalum "ALL_GROUPS" inazima logs za
        // groups zote kwa wakati mmoja.
        silentLogGroups: [],
    };
}

/**
 * Factory - hutengeneza settings manager mpya, huru, inayotumia faili yake
 * binafsi. Hii hutumika na sessionManager.js kwa kila child session.
 */
function createSettingsManager(settingsFilePath) {
    const SETTINGS_FILE = settingsFilePath;

    function loadSettings() {
        try {
            fs.ensureFileSync(SETTINGS_FILE);
            const raw = fs.readFileSync(SETTINGS_FILE, "utf-8").trim();
            if (!raw) {
                const defaults = defaultSettings();
                fs.writeJsonSync(SETTINGS_FILE, defaults, { spaces: 2 });
                return defaults;
            }
            const parsed = JSON.parse(raw);
            return { ...defaultSettings(), ...parsed };
        } catch (err) {
            const defaults = defaultSettings();
            fs.writeJsonSync(SETTINGS_FILE, defaults, { spaces: 2 });
            return defaults;
        }
    }

    let settings = loadSettings();

    function getSettings() {
        return settings;
    }

    function saveSettings() {
        fs.writeJsonSync(SETTINGS_FILE, settings, { spaces: 2 });
    }

    function setSetting(key, value) {
        settings[key] = value;
        saveSettings();
        return settings[key];
    }

    function toggleSetting(key) {
        settings[key] = !settings[key];
        saveSettings();
        return settings[key];
    }

    function isGroupAntiLinkOn(groupId) {
        if (!settings.antiLinkGroups) settings.antiLinkGroups = [];
        return settings.antiLinkGroups.includes(groupId);
    }

    function setGroupAntiLink(groupId, on) {
        if (!settings.antiLinkGroups) settings.antiLinkGroups = [];
        const idx = settings.antiLinkGroups.indexOf(groupId);
        if (on && idx === -1) {
            settings.antiLinkGroups.push(groupId);
        } else if (!on && idx !== -1) {
            settings.antiLinkGroups.splice(idx, 1);
        }
        saveSettings();
        return on;
    }

    function isGroupAntiMentionOn(groupId) {
        if (!settings.antiMentionGroups) settings.antiMentionGroups = [];
        return settings.antiMentionGroups.includes(groupId);
    }

    function setGroupAntiMention(groupId, on) {
        if (!settings.antiMentionGroups) settings.antiMentionGroups = [];
        const idx = settings.antiMentionGroups.indexOf(groupId);
        if (on && idx === -1) {
            settings.antiMentionGroups.push(groupId);
        } else if (!on && idx !== -1) {
            settings.antiMentionGroups.splice(idx, 1);
        }
        saveSettings();
        return on;
    }

    function getGroupSettings(groupId) {
        if (!settings.groups) settings.groups = {};
        if (!settings.groups[groupId]) {
            settings.groups[groupId] = {
                welcome: false,
                goodbye: false,
                welcomeMsg: settings.defaultWelcomeMsg || defaultSettings().defaultWelcomeMsg,
                goodbyeMsg: settings.defaultGoodbyeMsg || defaultSettings().defaultGoodbyeMsg,
            };
        }
        return settings.groups[groupId];
    }

    function setGroupSetting(groupId, key, value) {
        const g = getGroupSettings(groupId);
        g[key] = value;
        settings.groups[groupId] = g;
        saveSettings();
        return g;
    }

    const manager = {
        getSettings,
        saveSettings,
        setSetting,
        toggleSetting,
        isGroupAntiLinkOn,
        setGroupAntiLink,
        isGroupAntiMentionOn,
        setGroupAntiMention,
        getGroupSettings,
        setGroupSetting,
    };

    // Sajili manager hii kwenye registry ya "valid managers" ili setActiveManager()
    // iikubali baadaye (tazama maelezo karibu na validManagers hapa chini).
    validManagers.add(manager);

    return manager;
}

// ---- Global singleton (owner bot) - tabia ya zamani, bila mabadiliko ----
const DEFAULT_SETTINGS_FILE = path.join(__dirname, "..", "data", "settings.json");
const globalManager = createSettingsManager(DEFAULT_SETTINGS_FILE);

// ---- ACTIVE MANAGER PROXY ----
// commands.js, groupCommands.js, extraCommands.js, na apiCommands.js zote
// zinafanya `require("./settings")` mara moja tu (Node module cache), kisha
// zinatumia `settingsManager.getSettings()` n.k moja kwa moja. Ili kuwezesha
// multi-session (.pairme) - ambapo kila session inahitaji settings.json yake
// YENYEWE - tunatumia "active manager" inayoweza kubadilishwa kwa muda na
// botManager.js KABLA ya kuita handleCommand(), kisha kurudishwa kwa
// globalManager baada ya command kumalizika. Kwa kuwa Node.js ni
// single-threaded na command moja inakamilika (await) kabla nyingine
// kuanza, hii ni salama kwa matumizi ya kawaida (session 1-5 zisizo nyingi).
let activeManager = globalManager;
validManagers.add(globalManager);

function setActiveManager(manager) {
    if (manager && validManagers.has(manager)) {
        activeManager = manager;
    } else {
        // Manager batili (au proxy/undefined) - rudi salama kwa default.
        activeManager = globalManager;
    }
}

function useDefaultManager() {
    activeManager = globalManager;
}

const proxy = {
    getSettings: (...a) => activeManager.getSettings(...a),
    saveSettings: (...a) => activeManager.saveSettings(...a),
    setSetting: (...a) => activeManager.setSetting(...a),
    toggleSetting: (...a) => activeManager.toggleSetting(...a),
    isGroupAntiLinkOn: (...a) => activeManager.isGroupAntiLinkOn(...a),
    setGroupAntiLink: (...a) => activeManager.setGroupAntiLink(...a),
    isGroupAntiMentionOn: (...a) => activeManager.isGroupAntiMentionOn(...a),
    setGroupAntiMention: (...a) => activeManager.setGroupAntiMention(...a),
    getGroupSettings: (...a) => activeManager.getGroupSettings(...a),
    setGroupSetting: (...a) => activeManager.setGroupSetting(...a),
};

// --- BONUS FEATURE: Command Cooldown tracking (in-memory, per process) ---
// Haihitaji kuwa persistent (JSON) - ni sawa ikipotea wakati bot inaanza upya.
const lastUsedAt = new Map(); // key: `${sessionLabel}:${command}:${sender}` -> timestamp

function checkAndSetCooldown(sessionLabel, command, sender, cooldownSeconds) {
    if (!cooldownSeconds || cooldownSeconds <= 0) return { onCooldown: false };
    const key = `${sessionLabel}:${command}:${sender}`;
    const now = Date.now();
    const last = lastUsedAt.get(key) || 0;
    const elapsed = (now - last) / 1000;
    if (elapsed < cooldownSeconds) {
        return { onCooldown: true, remaining: Math.ceil(cooldownSeconds - elapsed) };
    }
    lastUsedAt.set(key, now);
    return { onCooldown: false };
}

module.exports = {
    ...proxy,
    createSettingsManager,
    setActiveManager,
    useDefaultManager,
    checkAndSetCooldown,
    // Manager halisi ya owner bot (SIO proxy) - botManager.js LAZIMA itumie hii
    // (sio module.exports nzima) wakati inatengeneza owner bot instance, ili
    // kuepuka kupitisha proxy kama "settingsManager" yake - jambo linalosababisha
    // infinite recursion pale setActiveManager inapoitwa na hiyo proxy yenyewe.
    rawGlobalManager: globalManager,
};
