/**
 * BMW LITE - Logger
 * Logger rahisi yenye rangi kwa ajili ya console output.
 *
 * FEATURE 7 - Live Logs Viewer: kila ujumbe unaandikwa pia kwenye buffer
 * ya in-memory (ring buffer, max 300 lines) ili dashboard iweze kuisoma
 * kupitia /api/premium/logs bila kuhitaji kusoma faili la log kwenye disk.
 */

const chalk = require("chalk");

const MAX_LOG_LINES = 300;
const logBuffer = [];

function pushToBuffer(level, msg) {
    logBuffer.push({ level, msg, time: Date.now() });
    if (logBuffer.length > MAX_LOG_LINES) logBuffer.shift();
}

function timestamp() {
    return new Date().toLocaleTimeString("sw-TZ", { hour12: false });
}

function getRecentLogs(sinceTimestamp) {
    if (!sinceTimestamp) return logBuffer.slice(-100);
    return logBuffer.filter((l) => l.time > sinceTimestamp);
}

module.exports = {
    info: (msg) => { console.log(chalk.cyan(`[${timestamp()}] [INFO] `) + msg); pushToBuffer("info", msg); },
    success: (msg) => { console.log(chalk.green(`[${timestamp()}] [OK] `) + msg); pushToBuffer("success", msg); },
    warn: (msg) => { console.log(chalk.yellow(`[${timestamp()}] [WARN] `) + msg); pushToBuffer("warn", msg); },
    error: (msg) => { console.log(chalk.red(`[${timestamp()}] [ERROR] `) + msg); pushToBuffer("error", msg); },
    cmd: (msg) => { console.log(chalk.magenta(`[${timestamp()}] [CMD] `) + msg); pushToBuffer("cmd", msg); },
    getRecentLogs,
};
