/**
 * BMW LITE - Social Store
 * Huhifadhi data inayohitaji kudumu (persist) baada ya bot kuanzishwa upya:
 *   - AFK status (mtu gani yuko "hayupo" na sababu yake)
 *   - Warnings (maonyo ya kila mtumiaji ndani ya kila group)
 *
 * Tofauti na store.js (ambayo ni ya muda mfupi tu kwa Anti-Delete),
 * hii inaandikwa kwenye faili ya JSON (data/social.json) ili isipotee
 * bot ikizimwa/kuanzishwa upya.
 */

const fs = require("fs-extra");
const path = require("path");
const CONFIG = require("../config");

const SOCIAL_FILE = path.join(CONFIG.dataDir, "social.json");

function defaultData() {
    return {
        afk: {},      // { [jid]: { reason, since, chatId } }
        warnings: {}, // { [groupId]: { [jid]: count } }
        mentionGroupWarnings: {}, // { [groupId]: { [jid]: count } } - anti mention-group spam
        statusMentionDeleted: {}, // { [groupId]: count } - anti status-mention: idadi ya notifications zilizofutwa
    };
}

function load() {
    try {
        fs.ensureFileSync(SOCIAL_FILE);
        const raw = fs.readFileSync(SOCIAL_FILE, "utf-8").trim();
        if (!raw) {
            const defaults = defaultData();
            fs.writeJsonSync(SOCIAL_FILE, defaults, { spaces: 2 });
            return defaults;
        }
        const parsed = JSON.parse(raw);
        return { ...defaultData(), ...parsed };
    } catch (err) {
        const defaults = defaultData();
        fs.writeJsonSync(SOCIAL_FILE, defaults, { spaces: 2 });
        return defaults;
    }
}

let data = load();

function persist() {
    fs.writeJsonSync(SOCIAL_FILE, data, { spaces: 2 });
}

/* ---------------- AFK ---------------- */

function setAfk(jid, reason) {
    data.afk[jid] = { reason: reason || "No reason given", since: Date.now() };
    persist();
}

function clearAfk(jid) {
    if (data.afk[jid]) {
        const removed = data.afk[jid];
        delete data.afk[jid];
        persist();
        return removed;
    }
    return null;
}

function getAfk(jid) {
    return data.afk[jid] || null;
}

/* ---------------- WARNINGS ---------------- */

function getWarnings(groupId, jid) {
    return data.warnings?.[groupId]?.[jid] || 0;
}

function addWarning(groupId, jid) {
    if (!data.warnings[groupId]) data.warnings[groupId] = {};
    const current = (data.warnings[groupId][jid] || 0) + 1;
    data.warnings[groupId][jid] = current;
    persist();
    return current;
}

function resetWarnings(groupId, jid) {
    if (data.warnings[groupId]) {
        delete data.warnings[groupId][jid];
        persist();
    }
    return 0;
}

/* ---------------- ANTI MENTION-GROUP (tagging everyone repeatedly) ---------------- */
// Tofauti na warnings za kawaida (.warn - zinazowekwa na admin), hizi
// huongezeka kiotomatiki bot inapogundua mtu ame-mention watu wengi mno
// (ku-tag group nzima) mara kwa mara. Hutunzwa kando na warnings za .warn
// ili zisichanganyike na count tofauti (kikomo chake ni CONFIG.maxGroupMentionWarnings).

function getMentionGroupWarnings(groupId, jid) {
    return data.mentionGroupWarnings?.[groupId]?.[jid] || 0;
}

function addMentionGroupWarning(groupId, jid) {
    if (!data.mentionGroupWarnings) data.mentionGroupWarnings = {};
    if (!data.mentionGroupWarnings[groupId]) data.mentionGroupWarnings[groupId] = {};
    const current = (data.mentionGroupWarnings[groupId][jid] || 0) + 1;
    data.mentionGroupWarnings[groupId][jid] = current;
    persist();
    return current;
}

function resetMentionGroupWarnings(groupId, jid) {
    if (data.mentionGroupWarnings?.[groupId]) {
        delete data.mentionGroupWarnings[groupId][jid];
        persist();
    }
    return 0;
}

/* ---------------- ANTI STATUS-MENTION (X's status @ This group was mentioned) ---------------- */
// Kila mara bot inapofuta notification ya "status ilimtaja group hii", tunaongeza
// counter hii kwa group husika, ili ionekane kwenye .antimationgroup status kuwa
// feature inafanya kazi (badala ya kufuta kimya bila taarifa yoyote).

function getStatusMentionDeletedCount(groupId) {
    return data.statusMentionDeleted?.[groupId] || 0;
}

function incrementStatusMentionDeleted(groupId) {
    if (!data.statusMentionDeleted) data.statusMentionDeleted = {};
    const current = (data.statusMentionDeleted[groupId] || 0) + 1;
    data.statusMentionDeleted[groupId] = current;
    persist();
    return current;
}

module.exports = {
    setAfk,
    clearAfk,
    getAfk,
    getWarnings,
    addWarning,
    resetWarnings,
    getMentionGroupWarnings,
    addMentionGroupWarning,
    resetMentionGroupWarnings,
    getStatusMentionDeletedCount,
    incrementStatusMentionDeleted,
};
