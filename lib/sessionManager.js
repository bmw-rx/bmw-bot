const path = require("path");
const CONFIG = require("../config");
const settings = require("./settings");

const sessions = new Map();
const MAX_SESSIONS = 5;

function normalize(number) {
  return String(number || "").replace(/[^0-9]/g, "");
}

function listSessions() {
  return [...sessions.values()].map(({ number, instance }) => ({
    number,
    status: instance.getState().status,
  }));
}

function getSessionState(number) {
  const entry = sessions.get(normalize(number));
  return entry ? entry.instance.getState() : null;
}

function isActive(number) {
  const entry = sessions.get(normalize(number));
  return Boolean(entry && !["logged_out", "disconnected"].includes(entry.instance.getState().status));
}

async function createSession(number, customCode) {
  const normalized = normalize(number);
  if (normalized.length < 10) return { ok: false, error: "Namba si sahihi." };
  if (sessions.has(normalized)) return { ok: false, error: "Session ya namba hii tayari ipo." };
  if (sessions.size >= MAX_SESSIONS) return { ok: false, error: `Kikomo cha sessions ni ${MAX_SESSIONS}.` };

  const { createBotInstance } = require("./botManager");
  const instance = createBotInstance({
    sessionDir: path.join(CONFIG.sessionDir, `pair-${normalized}`),
    settingsManager: settings.createSettingsManager(path.join(CONFIG.dataDir, `settings-${normalized}.json`)),
    ownerNumber: normalized,
    label: `PAIR-${normalized}`,
  });
  sessions.set(normalized, { number: normalized, instance });
  await instance.startBot(normalized, customCode);
  return { ok: true, code: instance.getState().pairingCode, note: "Session imeanzishwa." };
}

async function destroySession(number) {
  const normalized = normalize(number);
  const entry = sessions.get(normalized);
  if (!entry) return false;
  await entry.instance.stop();
  sessions.delete(normalized);
  return true;
}

async function restoreSessions() {}

module.exports = { MAX_SESSIONS, createSession, destroySession, getSessionState, isActive, listSessions, restoreSessions };

