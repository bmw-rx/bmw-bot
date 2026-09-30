/**
 * BMW LITE - Group Commands
 * Commands za usimamizi wa group: kick, promote, demote, tagall, hidetag,
 * welcome/goodbye, group antilink, groupinfo, link/revoke.
 */

const CONFIG = require("../config");
const helpers = require("./helpers");
const logger = require("./logger");
const settingsManager = require("./settings");
const socialStore = require("./socialStore");

async function reply(sock, jid, text, quoted) {
    return sock.sendMessage(jid, { text }, { quoted });
}

/**
 * Hupata target JID(s) za amri (kick/promote/demote) - kutoka @mention,
 * reply, au namba iliyoandikwa moja kwa moja.
 */
function resolveTargets(msg, args) {
    const mentioned = helpers.getAllMentionedJids(msg);
    if (mentioned.length) return mentioned;

    const quotedJid = helpers.getMentionedOrQuotedJid(msg);
    if (quotedJid) return [quotedJid];

    if (args[0]) {
        const num = args[0].replace(/[^0-9]/g, "");
        if (num) return [`${num}@s.whatsapp.net`];
    }

    return [];
}

/**
 * Handler kuu wa group commands. Hurudisha `true` kama command ilishughulikiwa,
 * `false` kama command hii si ya group commands (ili commands.js iendelee kutafuta kwingine).
 */
async function handleGroupCommand(sock, msg, command, args, text) {
    const jid = msg.key.remoteJid;
    const isGroup = jid.endsWith("@g.us");
    const senderJid = msg.key.participant || msg.key.remoteJid;

    const groupOnlyCommands = [
        "kick", "promote", "demote", "tagall", "hidetag", "groupinfo",
        "link", "revoke", "welcome", "goodbye", "setwelcome", "setgoodbye",
        "close", "open", "warn", "warnings", "resetwarn", "resetwarnings",
        "antilinkgc", "antimationgroup",
    ];

    if (groupOnlyCommands.includes(command) && !isGroup) {
        await reply(sock, jid, "🚫 Command hii inafanya kazi ndani ya group tu.", msg);
        return true;
    }

    let metadata, isSenderAdmin, isBotAdmin;
    if (isGroup) {
        try {
            metadata = await sock.groupMetadata(jid);
            isSenderAdmin = helpers.isGroupAdmin(metadata, senderJid) || helpers.isOwnerNumber(senderJid, CONFIG.owner) || msg.key.fromMe;
            const botJid = sock.user?.id || "";
            isBotAdmin = helpers.isGroupAdmin(metadata, botJid);
        } catch (err) {
            logger.error(`groupMetadata error: ${err.message}`);
        }
    }

    switch (command) {
        case "kick": {
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Ni admin pekee wanaoweza kutumia command hii.", msg); return true; }
            if (!isBotAdmin) { await reply(sock, jid, "❗ Bot lazima iwe admin ili itoe wanachama.", msg); return true; }

            const targets = resolveTargets(msg, args);
            if (!targets.length) { await reply(sock, jid, "❗ Mention au reply mtu unayetaka kumtoa. Mfano: .kick @user", msg); return true; }

            try {
                await sock.groupParticipantsUpdate(jid, targets, "remove");
                await reply(sock, jid, `✅ Mwanachama ametolewa kwenye group.`, msg);
            } catch (err) {
                await reply(sock, jid, `❌ Imeshindwa kutoa mwanachama: ${err.message}`, msg);
            }
            return true;
        }

        case "promote": {
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Ni admin pekee wanaoweza kutumia command hii.", msg); return true; }
            if (!isBotAdmin) { await reply(sock, jid, "❗ Bot lazima iwe admin ili kupandisha cheo.", msg); return true; }

            const targets = resolveTargets(msg, args);
            if (!targets.length) { await reply(sock, jid, "❗ Mention au reply mtu unayetaka kumpandisha. Mfano: .promote @user", msg); return true; }

            try {
                await sock.groupParticipantsUpdate(jid, targets, "promote");
                await reply(sock, jid, `✅ Mwanachama amepandishwa kuwa admin.`, msg);
            } catch (err) {
                await reply(sock, jid, `❌ Imeshindwa kupandisha cheo: ${err.message}`, msg);
            }
            return true;
        }

        case "demote": {
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Ni admin pekee wanaoweza kutumia command hii.", msg); return true; }
            if (!isBotAdmin) { await reply(sock, jid, "❗ Bot lazima iwe admin ili kushusha cheo.", msg); return true; }

            const targets = resolveTargets(msg, args);
            if (!targets.length) { await reply(sock, jid, "❗ Mention au reply mtu unayetaka kumshusha. Mfano: .demote @user", msg); return true; }

            try {
                await sock.groupParticipantsUpdate(jid, targets, "demote");
                await reply(sock, jid, `✅ Admin ameshushwa cheo.`, msg);
            } catch (err) {
                await reply(sock, jid, `❌ Imeshindwa kushusha cheo: ${err.message}`, msg);
            }
            return true;
        }

        /* ===================== WARN SYSTEM ===================== */
        case "warn": {
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Only admins can use this command.", msg); return true; }

            const targets = resolveTargets(msg, args);
            if (!targets.length) { await reply(sock, jid, `❗ Mention or reply to the user you want to warn. Example: .warn @user`, msg); return true; }

            const target = targets[0];
            // Reason ni maneno yote isipokuwa @mention (mention haiingii kwenye args ya text kwa Baileys extendedTextMessage,
            // hivyo args nzima kwa kawaida ndiyo reason isipokuwa kama reply-based, ambapo args nzima pia ni reason)
            const reason = args.join(" ") || "No reason given";

            const count = socialStore.addWarning(jid, target);
            const max = CONFIG.maxWarnings || 3;

            if (count >= max) {
                socialStore.resetWarnings(jid, target);

                if (!isBotAdmin) {
                    await reply(sock, jid,
                        `⚠️ @${target.split("@")[0]} reached ${count}/${max} warnings, but I need to be *admin* to remove them.`,
                        { key: msg.key, message: msg.message }
                    );
                    await sock.sendMessage(jid, { text: `⚠️ @${target.split("@")[0]} reached ${count}/${max} warnings.`, mentions: [target] });
                    return true;
                }

                try {
                    await sock.sendMessage(jid, {
                        text: `🚫 @${target.split("@")[0]} reached ${count}/${max} warnings and has been removed.\nReason: ${reason}`,
                        mentions: [target],
                    });
                    await sock.groupParticipantsUpdate(jid, [target], "remove");
                } catch (err) {
                    await reply(sock, jid, `❌ Reached max warnings but failed to remove: ${err.message}`, msg);
                }
            } else {
                await sock.sendMessage(jid, {
                    text: `⚠️ @${target.split("@")[0]} has been warned (${count}/${max}).\nReason: ${reason}`,
                    mentions: [target],
                });
            }
            return true;
        }

        case "warnings": {
            const targets = resolveTargets(msg, args);
            const target = targets[0] || senderJid;
            const count = socialStore.getWarnings(jid, target);
            const max = CONFIG.maxWarnings || 3;

            await sock.sendMessage(jid, {
                text: `⚠️ @${target.split("@")[0]} has *${count}/${max}* warnings in this group.`,
                mentions: [target],
            });
            return true;
        }

        case "resetwarn":
        case "resetwarnings": {
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Only admins can use this command.", msg); return true; }

            const targets = resolveTargets(msg, args);
            if (!targets.length) { await reply(sock, jid, `❗ Mention or reply to the user. Example: .resetwarn @user`, msg); return true; }

            const target = targets[0];
            socialStore.resetWarnings(jid, target);

            await sock.sendMessage(jid, {
                text: `✅ Warnings reset for @${target.split("@")[0]}.`,
                mentions: [target],
            });
            return true;
        }

        case "tagall": {
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Ni admin pekee wanaoweza kutumia command hii.", msg); return true; }
            const allJids = metadata.participants.map((p) => p.id);
            let out = `📢 *TAG ALL* (${allJids.length})\n\n${text || "Tahadhari kwa wote!"}\n\n`;
            allJids.forEach((j) => { out += `@${j.split("@")[0]} `; });
            await sock.sendMessage(jid, { text: out.trim(), mentions: allJids }, { quoted: msg });
            return true;
        }

        case "hidetag": {
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Ni admin pekee wanaoweza kutumia command hii.", msg); return true; }
            const allJids = metadata.participants.map((p) => p.id);
            await sock.sendMessage(jid, { text: text || "📢", mentions: allJids }, { quoted: msg });
            return true;
        }

        case "groupinfo": {
            const owner = metadata.owner || "Haijulikani";
            const admins = metadata.participants.filter((p) => p.admin).length;
            await reply(
                sock, jid,
                `ℹ️ *TAARIFA ZA GROUP*\n\n` +
                `📛 Jina: ${metadata.subject}\n` +
                `👥 Wanachama: ${metadata.participants.length}\n` +
                `👑 Admins: ${admins}\n` +
                `📝 Maelezo: ${metadata.desc || "Hakuna"}\n` +
                `🆔 ID: ${jid}`,
                msg
            );
            return true;
        }

        case "link": {
            try {
                const code = await sock.groupInviteCode(jid);
                await reply(sock, jid, `🔗 Link ya group:\nhttps://chat.whatsapp.com/${code}`, msg);
            } catch (err) {
                await reply(sock, jid, `❌ Imeshindwa kupata link: ${err.message}`, msg);
            }
            return true;
        }

        case "revoke": {
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Ni admin pekee wanaoweza kutumia command hii.", msg); return true; }
            try {
                const code = await sock.groupRevokeInvite(jid);
                await reply(sock, jid, `✅ Link mpya imetengenezwa:\nhttps://chat.whatsapp.com/${code}`, msg);
            } catch (err) {
                await reply(sock, jid, `❌ Imeshindwa: ${err.message}`, msg);
            }
            return true;
        }

        case "close": {
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Ni admin pekee wanaoweza kutumia command hii.", msg); return true; }
            if (!isBotAdmin) { await reply(sock, jid, "❗ Bot lazima iwe admin.", msg); return true; }
            await sock.groupSettingUpdate(jid, "announcement");
            await reply(sock, jid, "🔒 Group imefungwa - wanachama wa kawaida hawawezi kutuma ujumbe.", msg);
            return true;
        }

        case "open": {
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Ni admin pekee wanaoweza kutumia command hii.", msg); return true; }
            if (!isBotAdmin) { await reply(sock, jid, "❗ Bot lazima iwe admin.", msg); return true; }
            await sock.groupSettingUpdate(jid, "not_announcement");
            await reply(sock, jid, "🔓 Group imefunguliwa - wanachama wote wanaweza kutuma ujumbe.", msg);
            return true;
        }

        case "welcome": {
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Ni admin pekee wanaoweza kutumia command hii.", msg); return true; }
            const choice = (args[0] || "").toLowerCase();
            if (choice !== "on" && choice !== "off") {
                const cur = settingsManager.getGroupSettings(jid).welcome;
                await reply(sock, jid, `ℹ️ Welcome message hivi sasa ni: ${helpers.onOff(cur)}\nTumia: .welcome on/off`, msg);
                return true;
            }
            settingsManager.setGroupSetting(jid, "welcome", choice === "on");
            await reply(sock, jid, `✅ Welcome message: ${helpers.onOff(choice === "on")}`, msg);
            return true;
        }

        case "goodbye": {
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Ni admin pekee wanaoweza kutumia command hii.", msg); return true; }
            const choice = (args[0] || "").toLowerCase();
            if (choice !== "on" && choice !== "off") {
                const cur = settingsManager.getGroupSettings(jid).goodbye;
                await reply(sock, jid, `ℹ️ Goodbye message hivi sasa ni: ${helpers.onOff(cur)}\nTumia: .goodbye on/off`, msg);
                return true;
            }
            settingsManager.setGroupSetting(jid, "goodbye", choice === "on");
            await reply(sock, jid, `✅ Goodbye message: ${helpers.onOff(choice === "on")}`, msg);
            return true;
        }

        case "setwelcome": {
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Ni admin pekee wanaoweza kutumia command hii.", msg); return true; }
            if (!text) { await reply(sock, jid, "❗ Mfano: .setwelcome Karibu @user kwenye @group!\n(Tumia @user na @group kama placeholders)", msg); return true; }
            settingsManager.setGroupSetting(jid, "welcomeMsg", text);
            await reply(sock, jid, "✅ Welcome message imebadilishwa.", msg);
            return true;
        }

        case "setgoodbye": {
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Ni admin pekee wanaoweza kutumia command hii.", msg); return true; }
            if (!text) { await reply(sock, jid, "❗ Mfano: .setgoodbye Kwaheri @user!\n(Tumia @user kama placeholder)", msg); return true; }
            settingsManager.setGroupSetting(jid, "goodbyeMsg", text);
            await reply(sock, jid, "✅ Goodbye message imebadilishwa.", msg);
            return true;
        }

        case "antilinkgc": {
            if (!isGroup) { await reply(sock, jid, "🚫 Command hii inafanya kazi ndani ya group tu.", msg); return true; }
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Ni admin pekee wanaoweza kutumia command hii.", msg); return true; }

            const choice = (args[0] || "").toLowerCase();
            if (choice !== "on" && choice !== "off") {
                const cur = settingsManager.isGroupAntiLinkOn(jid);
                await reply(sock, jid, `ℹ️ Anti-link kwa group hii: ${helpers.onOff(cur)}\nTumia: .antilinkgc on/off`, msg);
                return true;
            }
            settingsManager.setGroupAntiLink(jid, choice === "on");
            await reply(sock, jid, `✅ Anti-link kwa group hii: ${helpers.onOff(choice === "on")}`, msg);
            return true;
        }

        /* ===================== ANTI MENTION-GROUP (tag-everyone spam) ===================== */
        case "antimationgroup": {
            if (!isGroup) { await reply(sock, jid, "🚫 Command hii inafanya kazi ndani ya group tu.", msg); return true; }
            if (!isSenderAdmin) { await reply(sock, jid, "🚫 Ni admin pekee wanaoweza kutumia command hii.", msg); return true; }

            const choice = (args[0] || "").toLowerCase();
            const minMentions = CONFIG.minMentionsForGroupTag || 5;
            const maxWarn = CONFIG.maxGroupMentionWarnings || 3;

            if (choice !== "on" && choice !== "off") {
                const cur = settingsManager.isGroupAntiMentionOn(jid);
                await reply(
                    sock, jid,
                    `ℹ️ Anti Mention-Group kwa group hii: ${helpers.onOff(cur)}\n` +
                    `Tumia: .antimationgroup on/off\n\n` +
                    `📌 Mtu aki-mention watu ${minMentions}+ kwa ujumbe mmoja (ku-tag group), ` +
                    `atapata onyo. Akifikisha ${maxWarn}/${maxWarn} onyo, ataondolewa kiotomatiki ` +
                    `(bot lazima iwe admin). Admin/owner hawaguswi na feature hii.\n` +
                    `📌 Pia, mtu akitag group hii kwenye status/story yake, taarifa ` +
                    `("This group was mentioned") itafutwa moja kwa moja kwenye group (bot lazima iwe admin).`,
                    msg
                );
                return true;
            }

            settingsManager.setGroupAntiMention(jid, choice === "on");
            await reply(sock, jid, `✅ Anti Mention-Group kwa group hii: ${helpers.onOff(choice === "on")}`, msg);
            return true;
        }

        default:
            return false;
    }
}

module.exports = { handleGroupCommand };
