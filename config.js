/**
 * BMW LITE WhatsApp Bot - Configuration
 * Hariri faili hii kuweka mipangilio yako mwenyewe.
 */

const CONFIG = {
    // Namba ya owner (bila + au alama nyingine), mfano: 255655254973
    owner: "255743383943",

    // Jina la bot
    botName: "BMW LITE",

    // Prefix ya commands
    prefix: ".",

    // Version ya bot
    version: "2.0.0",

    // Namba itakayotumika kupair bot (bila +). Ikiwa tupu, bot itasubiri mtu
    // aweke namba kwenye website (dashboard) - hivyo hakuna haja ya kuandika namba hapa.
    pairingNumber: process.env.PAIRING_NUMBER || "",

    // Port ya web dashboard.
    // Katabump/Pterodactyl hutoa SERVER_PORT; tunaitumia kwanza, kisha PORT, kisha 3000.
    webPort: process.env.SERVER_PORT || process.env.PORT || 3000,

    // Debug: ikiwa true, itaonyesha raw response ya API kwenye console (terminal)
    // Weka 'true' wakati unataka kuona muundo halisi wa data kutoka API (kwa troubleshooting)
    // Baada ya kumaliza kutatua matatizo, badilisha iwe 'false'
    debugApi: true,

    // Base URL ya API
    apiBaseUrl: "https://api.siputzx.my.id/api",

    // Timezone ya kuonyesha muda
    timezone: "Africa/Dar_es_Salaam",

    // Auto features - default state (zinaweza kubadilishwa runtime kupitia commands na zitahifadhiwa data/settings.json)
    autoFeatures: {
        autoStatusView: false,
        autoTyping: false,
        autoRecord: false, // presence ya "inarekodi audio" badala ya "inaandika" (fake recording)
        autoReactStatus: false,
        antiLink: false,
        antiDelete: false,
    },

    // Idadi ya warnings kabla mtu hajatolewa kiotomatiki kwenye group (.warn)
    maxWarnings: 3,

    // ANTI MENTION-GROUP: mtu aki-mention (ku-tag) watu wengi mno kwa mara
    // moja (yaani anajaribu ku-tag group nzima), hii huhesabika kama "mention
    // group" moja. Akifanya hivi mara nyingi (maxGroupMentionWarnings), hupewa
    // warning/kuondolewa. minMentionsForGroupTag = idadi ya chini ya @mentions
    // kwenye ujumbe mmoja ili ihesabike kama "ame-tag group" (sio @mention za kawaida).
    maxGroupMentionWarnings: 3,
    minMentionsForGroupTag: 5,

    // Emoji itakayotumika ku-react status wakati autoReactStatus ni true
    statusReactEmoji: "💚",

    // Emoji zinazotumika na .autoreact (react kila ujumbe unaoingia) - moja
    // itachaguliwa kwa nasibu (random) kila wakati ujumbe ukiingia
    autoReactEmojis: ["🤞", "💕", "🤒", "💁", "🌸", "🍁", "🌼", "🍄", "🌄", "⚡", "🌪️", "🌞"],

    // Folder za session/data
    sessionDir: "./session",
    dataDir: "./data",

    // --- Website Accounts (visitor signup/login kwenye landing page) ---
    siteJwtSecret: process.env.SITE_JWT_SECRET || "change-this-dev-secret",
    whatsappContactNumber: process.env.WHATSAPP_CONTACT_NUMBER || "255693469723",

    // --- Email (welcome email baada ya signup) - weka hizi kwenye Environment
    // Variables za hosting yako. Zikiwa hazipo, email haitatumwa (signup
    // itaendelea kufanya kazi, lakini bila email - haita-crash).
    smtpHost: process.env.SMTP_HOST || "",
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpUser: process.env.SMTP_USER || "",
    smtpPass: process.env.SMTP_PASS || "",
    smtpFrom: process.env.SMTP_FROM || "BMW LITE <no-reply@bmwlite.app>",
    tempDir: "./temp",

    // Branding ya bot - inatumika kwenye ujumbe wa "Bot is Online" na .menu
    botImage: "https://files.catbox.moe/bhrhtz.jpg",
    botSong: "https://files.catbox.moe/s08tfr.mp3",
    botChannel: "https://whatsapp.com/channel/0029VbCjkJP2P59fBeYUuN1H",

    // JID kamili ya channel (mfano "120363xxxxxxxxxx@newsletter"). Ikiwa imewekwa,
    // auto-join itaitumia hii moja kwa moja (haraka zaidi na ya kuaminika kuliko
    // kutafuta jid kupitia invite code kwenye botChannel).
    botChannelJid: "120363426052767455@newsletter",

    // Jina la channel linaloonyeshwa kwenye tag ya "Forwarded from" (angalia
    // CHANNEL BRANDING chini) - ikiwa tupu, botName itatumika.
    channelName: "BMW LITE",

    // --- CHANNEL BRANDING (Forwarded-from-Channel tag) ---
    // Ukiwasha hii, kila ujumbe unaotumwa na bot (majibu ya commands) utaonekana
    // kwenye WhatsApp na tag ya "Forwarded many times" / "Forwarded from
    // [channelName]" - sawa na jinsi bots nyingi kama JINU zinavyo-brand ujumbe
    // wao, ila hapa inatumia channel ya BMW LITE (botChannelJid juu), sio ya bot
    // nyingine. Default value hapa chini inatumika tu kama data/settings.json
    // haina "channelBranding" bado (baada ya hapo dashboard/.channelbranding
    // command ndio inayoamua - angalia lib/settings.js).
    channelBrandingEnabled: true,

    // Maandishi ya footer kwenye .menu / online message (premium - inaweza
    // kubadilishwa kupitia dashboard). Default: "Powered by Baileys"
    onlineFooter: "Powered by Baileys",

    // Custom branded pairing code (mfano "BMWLITE1"). LAZIMA iwe herufi/namba
    // 8 kwa jumla, uppercase, bila alama - vinginevyo Baileys itatumia code
    // ya nasibu kama kawaida. Inaweza kubadilishwa kupitia Premium Dashboard.
    customPairingCode: "BMWLITE1",

    // Ujumbe wa "Bot is Online" kwa owner
    onlineMessage: (botName, version) =>
        `✅ *${botName} ni ONLINE*\n\n` +
        `📦 Version: ${version}\n` +
        `🕒 Wakati: ${new Date().toLocaleString("sw-TZ", { timeZone: "Africa/Dar_es_Salaam" })}\n\n` +
        `Tuma *.menu* kuona commands zote.`,

    /* ===================== API KEYS (Set via environment variables or here) ===================== */
    // GROQ AI API (for .ai command) - PRIMARY
    // USIWEKE key moja kwa moja hapa - tumia Environment Variable kwenye panel (GROQ_API_KEY)
    groqApiKey: process.env.GROQ_API_KEY || "",
    groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    // Docs: https://console.groq.com
    // Get free key: https://console.groq.com/keys

    // OPENROUTER AI API (for .ai command) - FALLBACK, hutumika tu Groq ikishindwa
    // USIWEKE key moja kwa moja hapa - tumia Environment Variable kwenye panel (OPENROUTER_API_KEY)
    openrouterApiKey: process.env.OPENROUTER_API_KEY || "",
    openrouterModel: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
    // Docs: https://openrouter.ai/docs
    // Get free key: https://openrouter.ai/keys

    // WEATHER API (OpenWeatherMap)
    weatherApiKey: process.env.WEATHER_API_KEY || "",
    // Docs: https://openweathermap.org/api
    // Get free key: https://openweathermap.org/api

    // LYRICS API (Musixmatch)
    lyricsApiKey: process.env.LYRICS_API_KEY || "",
    // Docs: https://www.musixmatch.com/api

    // NEWS API (NewsAPI)
    newsApiKey: process.env.NEWS_API_KEY || "",
    // Docs: https://newsapi.org
    // Get free key: https://newsapi.org/register

    // TRANSLATE API (Google Translate)
    translateApiKey: process.env.TRANSLATE_API_KEY || "",
    // Docs: https://cloud.google.com/translate/docs
    // Get key: https://cloud.google.com/docs/authentication/getting-started

    // MOVIE API (OMDB)
    movieApiKey: process.env.MOVIE_API_KEY || "",
    // Docs: https://omdbapi.com
    // Get free key: https://omdbapi.com/apikey.aspx

    // SPOTIFY API
    spotifyApiKey: process.env.SPOTIFY_API_KEY || "",
    // Docs: https://developer.spotify.com/documentation/web-api
    // Get credentials: https://developer.spotify.com/dashboard

    // CMNTY API (lyrics, downloader/aiov3, maker/wasted, maker/video-player, canvas/notifwa, n.k)
    // Weka CMNTY_API_KEY kwenye Environment Variables kwenye panel yako badala ya kuandika hapa moja kwa moja
    cmntyApiKey: process.env.CMNTY_API_KEY || "cmnty-895a1984c1882c3cf663147b958b30a8",
    // Docs: https://api.cmnty.biz.id

    /* ===================== DAVID CYRIL API - NEW FEATURES ===================== */
    // Hizi features zifuata zinakazi kwenye https://apis.davidcyril.name.ng
    // Hazihitaji API keys - zinatumia wrapper functions tu
    // Features:
    // .apk - APK downloader
    // .chatbot - Blackbox AI chat
    // .news - BBC News
    // .musicgen - AI Music Generate
    // .imggrt2 - Flux v2 Image Generation
    // .lyrics2 - Lyrics Search v2

    // Random facts kwa .fact (orodha ya ndani, haihitaji API - haraka na haiwezi kuvunjika)
    randomFacts: [
        "Honey never spoils. Archaeologists have found 3,000-year-old honey in Egyptian tombs that's still edible.",
        "A group of flamingos is called a 'flamboyance'.",
        "Octopuses have three hearts and blue blood.",
        "Bananas are berries, but strawberries aren't.",
        "The shortest war in history lasted 38 minutes (Anglo-Zanzibar War, 1896).",
        "A day on Venus is longer than a year on Venus.",
        "Sharks existed before trees — sharks are about 400 million years old.",
        "The human brain uses about 20% of the body's total energy.",
        "Wombat poop is cube-shaped.",
        "There are more possible chess games than atoms in the observable universe.",
        "Mount Everest grows about 4mm taller every year due to tectonic activity.",
        "Cows have best friends and get stressed when separated from them.",
        "The Eiffel Tower can grow taller in summer due to heat expansion.",
        "A single strand of spaghetti is called a 'spaghetto'.",
        "Sea otters hold hands while sleeping so they don't drift apart.",
        "Scotland's national animal is the unicorn.",
        "It rains diamonds on Jupiter and Saturn.",
        "The inventor of the Pringles can is buried in one.",
        "Bananas float in water; apples, pears, and oranges too.",
        "Some cats are actually allergic to humans.",
    ],

    // Trivia questions kwa .trivia (swali + majibu 4 + jibu sahihi)
    triviaQuestions: [
        { q: "What is the capital city of Tanzania?", options: ["Dar es Salaam", "Dodoma", "Arusha", "Mwanza"], answer: 1 },
        { q: "Which planet is known as the Red Planet?", options: ["Venus", "Jupiter", "Mars", "Saturn"], answer: 2 },
        { q: "How many continents are there on Earth?", options: ["5", "6", "7", "8"], answer: 2 },
        { q: "What is the largest mammal in the world?", options: ["Elephant", "Blue Whale", "Giraffe", "Great White Shark"], answer: 1 },
        { q: "Who wrote the theory of relativity?", options: ["Isaac Newton", "Albert Einstein", "Nikola Tesla", "Galileo Galilei"], answer: 1 },
        { q: "What is the chemical symbol for Gold?", options: ["Gd", "Go", "Au", "Ag"], answer: 2 },
        { q: "Which country hosted the 2010 FIFA World Cup?", options: ["Brazil", "Germany", "South Africa", "Qatar"], answer: 2 },
        { q: "What is the longest river in the world?", options: ["Amazon River", "Nile River", "Yangtze River", "Mississippi River"], answer: 1 },
        { q: "How many bones are in the adult human body?", options: ["186", "206", "226", "246"], answer: 1 },
        { q: "What gas do plants absorb from the atmosphere?", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], answer: 2 },
        { q: "Which ocean is the largest?", options: ["Atlantic", "Indian", "Arctic", "Pacific"], answer: 3 },
        { q: "What is the fastest land animal?", options: ["Lion", "Cheetah", "Horse", "Leopard"], answer: 1 },
    ],
};

module.exports = CONFIG;
