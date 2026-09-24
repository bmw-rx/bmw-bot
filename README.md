# 🚗 BMW LITE — WhatsApp Bot (Termux + Baileys)

Bot kamili ya WhatsApp inayotumia [Baileys](https://github.com/WhiskeySockets/Baileys), ikiwa na AI, Downloader, Maker, Search, Tools na Auto Features. Inafanya kazi vizuri kwenye **Termux**.

---

## 📋 MAHITAJI

- Termux (kutoka F-Droid, sio Play Store — toleo la Play Store limepitwa na wakati)
- Internet
- Namba ya WhatsApp itakayotumika kupair bot

---

## ⚙️ HATUA ZA KUSANIDI KWENYE TERMUX

### 1. Sasisha Termux na sakinisha Node.js + Git

```bash
pkg update -y && pkg upgrade -y
pkg install nodejs-lts git -y
```

Hakikisha Node.js imesakinika vizuri:

```bash
node -v
npm -v
```

(Inahitajika Node.js >= 18)

### 2. Pata faili za bot

Kama una faili kwenye zip au folder, ziingize Termux kwa `termux-setup-storage` kisha copy, au kama ziko kwenye Git repo:

```bash
git clone https://github.com/BMW3006/bmw-lite
cd bmw-lite
```

Au kama tayari una folder ya bot, ingia tu ndani yake:

```bash
cd bmw-lite
```

### 3. Sakinisha dependencies

```bash
npm install
```

Hii itasakinisha: `@whiskeysockets/baileys`, `axios`, `chalk`, `fs-extra`, `moment-timezone`, `node-cache`, `pino`, `qrcode-terminal`.

### 4. Hariri `config.js`

Fungua faili `config.js` kwa nano:

```bash
nano config.js
```

Badilisha:

```javascript
const CONFIG = {
    owner: "255655254973",   // <-- weka namba yako bila + 
    botName: "BMW LITE",
    prefix: ".",
    version: "2.0.0",
    pairingNumber: "255655254973", // namba itakayotumika kupair bot
    ...
};
```

Bonyeza `CTRL + X`, kisha `Y`, kisha `ENTER` kuhifadhi.

### 5. Anzisha bot

Una njia **mbili** za kuanzisha bot:

#### Njia A: Dashboard ya Web (rahisi zaidi — pendekezwa)

```bash
npm run dashboard
```

Hii itaanzisha web server. Utaona:

```
🌐 Dashboard inafanya kazi: http://localhost:3000
```

Fungua **Chrome au browser yoyote kwenye simu hiyo hiyo** uliyofunga Termux, nenda:

```
http://localhost:3000
```

Utaona dashboard yenye fomu — andika namba yako ya WhatsApp (mfano `255655254973`) na bonyeza **"Pata Pairing Code"**. Pairing code itaonekana moja kwa moja kwenye ukurasa huo huo, bila kuhitaji terminal.

Dashboard pia ina vitufe vya kuwasha/kuzima **Auto Features** moja kwa moja (Auto Status View, Auto Typing, Auto React, Anti Link, Anti Delete) — bila kuhitaji kuandika commands.

> **Muhimu:** Dashboard inafanya kazi ndani ya mtandao wa simu yako tu (`localhost`). Huwezi kuifungua kwenye simu nyingine isipokuwa uko kwenye mtandao mmoja (WiFi) na utumie IP ya Termux badala ya `localhost` (mfano `http://192.168.x.x:3000` — pata IP kwa `ifconfig` au `ip addr`).

#### Njia B: Terminal (CLI mode ya zamani)

```bash
npm start
```

Bot itaonyesha **Pairing Code** (mfano: `ABCD-1234`) kwenye terminal moja kwa moja.

### 6. Pair WhatsApp yako

Kwenye simu yako:
1. Fungua **WhatsApp**
2. Nenda **Settings (Mipangilio) > Linked Devices (Vifaa Vilivyounganishwa)**
3. Bonyeza **Link a Device**
4. Chagua **Link with phone number instead**
5. Ingiza namba uliyoweka kwenye `pairingNumber`
6. Bot itakupa **Pairing Code** — ingiza code hiyo kwenye simu

Mara connection ikifanikiwa, bot itatuma ujumbe **"Bot is Online"** kwa owner namba kiotomatiki.

---

## 🟢 KUENDESHA BOT MUDA WOTE (Background)

Kwenye Termux, tumia `tmux` au `screen` ili bot iendelee kufanya kazi hata ukifunga Termux:

```bash
pkg install tmux -y
tmux new -s bmwbot
npm start
```

Kutoka kwenye session bila kuzima bot: bonyeza `CTRL+B` kisha `D`.

Kurudi kwenye session: `tmux attach -t bmwbot`

---

## 🧩 COMMANDS ZOTE

### Basic
| Command | Maelezo |
|---|---|
| `.ping` | Angalia kama bot iko hai |
| `.hello` | Salamu kutoka kwa bot |
| `.time` | Onyesha muda wa sasa |
| `.status` | Onyesha hali ya bot na auto features |
| `.menu` | Onyesha commands zote |

### AI
| Command | Maelezo |
|---|---|
| `.ai [swali]` | Ongea na DuckAI |
| `.bible [swali] [translation]` | Bible AI — translation: ESV, NIV, KJV |

### Downloader
| Command | Maelezo |
|---|---|
| `.tiktok [url]` | Pakua video ya TikTok bila watermark |
| `.fb [url]` | Pakua video ya Facebook |

### Maker
| Command | Maelezo |
|---|---|
| `.photooxy [text]` | Tengeneza picha ya PhotoOxy effect |
| `.ephoto [text]` | Tengeneza picha ya Ephoto360 effect |
| `.textpro [text]` | Tengeneza picha ya TextPro effect |

### Search
| Command | Maelezo |
|---|---|
| `.gimg [query]` | Tafuta picha Google (zinatumwa hadi 5) |
| `.yt [query]` | Tafuta video YouTube (orodha) |

### Tools
| Command | Maelezo |
|---|---|
| `.country [name]` | Taarifa za nchi |
| `.ssweb [url]` | Screenshot ya website |

### Auto Features (Owner Only)
| Command | Maelezo |
|---|---|
| `.autostatusview on/off` | Bot ione status za watu kiotomatiki |
| `.autotyping on/off` | Bot ionyeshe "inaandika..." kiotomatiki |
| `.autoreact on/off` | Bot i-react status za watu kiotomatiki |
| `.antilink on/off` | Futa ujumbe wenye link kwenye group (admin pekee) |
| `.antidelete on/off` | Bot ituma kwa owner ujumbe uliofutwa na mtumiaji |
| `.vv` | Reply kwenye "view once" message ili kuifungua |

> **Note:** Auto features zinahifadhiwa kwenye `data/settings.json` na zinabaki hata bot ikianzishwa upya.

---

## 🧹 SCRIPTS NYINGINE

### Kusafisha faili za muda (temp)

```bash
npm run cleanup
```

### Kufuta session na ku-pair namba mpya

```bash
npm run reset-session
```

Hii itafuta folder ya `session/` na kukuuliza uthibitisho kabla ya kufuta.

---

## 📁 MUUNDO WA PROJECT

```
bmw-lite-bot/
├── index.js              # CLI entry point - Baileys connection (terminal mode)
├── dashboard.js            # Web dashboard server (Express) - pairing kupitia browser
├── commands.js            # Logic ya commands zote (.ping, .ai, .tiktok, n.k)
├── config.js               # CONFIG: owner, botName, prefix, version, webPort
├── cleanup.js              # Script ya kusafisha temp files
├── reset-session.js        # Script ya kufuta session
├── package.json
├── public/
│   └── index.html            # Dashboard frontend (fomu ya pairing + toggles)
├── lib/
│   ├── botManager.js         # Logic ya Baileys connection (inatumiwa na index.js NA dashboard.js)
│   ├── api.js                # Wrapper ya API zote za siputzx
│   ├── settings.js          # Usimamizi wa auto features (on/off + persistence)
│   ├── store.js              # Message store kwa ajili ya Anti Delete
│   ├── logger.js             # Console logger yenye rangi
│   └── helpers.js            # Functions za msaada (muda, link detection, extractText, n.k)
├── session/                 # Baileys auth credentials (haziingii git)
├── data/
│   └── settings.json         # Hali ya auto features (imehifadhiwa)
└── temp/                    # Faili za muda
```

---

## ⚠️ MAONI MUHIMU

- **Usishirikishe** session yako (`session/` folder) na mtu yeyote — ina uwezo wa kuingia kwenye WhatsApp yako.
- API zinazotumika ni za nje (`api.siputzx.my.id`) — kama API hazipatikani, command husika itashindwa na bot itatuma ujumbe wa hitilafu badala ya kukwama.
- Anti-link inahitaji bot iwe **admin** kwenye group ili iweze kufuta ujumbe.
- Kwa utendaji bora wa muda mrefu kwenye Termux, tumia `tmux`/`screen` na uzime "Battery Optimization" kwa Termux kwenye simu yako (Settings > Apps > Termux > Battery > Unrestricted).

---

_BMW LITE • Powered by Baileys & Node.js_
