/**
 * BMW LITE - Auto Updater
 * Pulls the latest code from the GitHub repository and installs dependencies.
 *
 * Repo: https://github.com/BMW3006/bmw-lite
 */

const { exec } = require("child_process");
const path = require("path");
const logger = require("./logger");

const REPO_URL = "https://github.com/BMW3006/bmw-lite";
const ROOT_DIR = path.join(__dirname, "..");

/**
 * Run a shell command and return a promise with its output.
 */
function run(cmd, options = {}) {
    return new Promise((resolve, reject) => {
        exec(cmd, { cwd: ROOT_DIR, timeout: 120000, ...options }, (err, stdout, stderr) => {
            if (err) {
                return reject(new Error(stderr?.trim() || err.message));
            }
            resolve((stdout || "").trim());
        });
    });
}

/**
 * Check if this directory is a git repository.
 */
async function isGitRepo() {
    try {
        await run("git rev-parse --is-inside-work-tree");
        return true;
    } catch {
        return false;
    }
}

/**
 * Check how many commits behind the local repo is compared to remote.
 * Returns { behind, current, latest, commits }.
 */
async function checkForUpdates() {
    if (!(await isGitRepo())) {
        throw new Error("This folder is not a git repository. Clone it from " + REPO_URL);
    }

    await run("git fetch --all");

    // Detect the current branch
    const branch = await run("git rev-parse --abbrev-ref HEAD");

    const current = await run("git rev-parse HEAD");
    const latest = await run(`git rev-parse origin/${branch}`);

    let behind = 0;
    try {
        const count = await run(`git rev-list --count HEAD..origin/${branch}`);
        behind = parseInt(count, 10) || 0;
    } catch {
        behind = current === latest ? 0 : 1;
    }

    // Short log of the new commits
    let commits = "";
    if (behind > 0) {
        try {
            commits = await run(`git log --oneline HEAD..origin/${branch} -5`);
        } catch {
            commits = "";
        }
    }

    return { behind, current, latest, branch, commits };
}

/**
 * Pull the latest code and install dependencies.
 * Returns a summary string.
 */
async function performUpdate() {
    if (!(await isGitRepo())) {
        throw new Error("This folder is not a git repository. Clone it from " + REPO_URL);
    }

    const branch = await run("git rev-parse --abbrev-ref HEAD");

    // Stash any local changes so the pull doesn't fail
    try {
        await run("git stash --include-untracked");
    } catch {
        /* ignore stash errors (nothing to stash) */
    }

    // Reset to remote to guarantee a clean update
    await run("git fetch --all");
    const pullOutput = await run(`git reset --hard origin/${branch}`);
    logger.info(`Update reset: ${pullOutput}`);

    // Install dependencies (in case package.json changed)
    let installOutput = "";
    try {
        installOutput = await run("npm install --no-audit --no-fund", { timeout: 300000 });
    } catch (err) {
        logger.error(`npm install during update failed: ${err.message}`);
        installOutput = "npm install failed - run it manually if needed.";
    }

    return { branch, pullOutput, installOutput };
}

module.exports = {
    REPO_URL,
    isGitRepo,
    checkForUpdates,
    performUpdate,
};
