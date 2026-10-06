const fs = require("fs-extra");
const path = require("path");
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");

/**
 * Keeps the existing sqlite-shaped session contract while using Baileys'
 * stable multi-file credential store. The session path is derived from the
 * requested sqlite filename, so existing deployments can start safely.
 */
async function useSqliteAuthState(databasePath) {
  const sessionDir = databasePath.replace(/\.sqlite$/i, "");
  await fs.ensureDir(path.dirname(sessionDir));
  const auth = await useMultiFileAuthState(sessionDir);
  return {
    state: auth.state,
    saveCreds: auth.saveCreds,
    close: async () => {},
  };
}

module.exports = { useSqliteAuthState };

