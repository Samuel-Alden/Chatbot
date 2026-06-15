const config = require('../config')
const { normalizeJid, isAdmin, isBotAdmin } = require('../utils/helper')
const { findCommand, renderMenu, renderCommandHelp } = require('./commandRegistry')
const economy = require('../commands/economy')
const { getGroupSettings } = require('../commands/group')

const cooldowns = new Map()

/**
 * Tracks recently seen prefixed messages for antiBot correlation.
 * Shape: Map<msgId, { timestampS: number, groupId: string, senderJid: string }>
 *
 * Intentionally non-persistent — clears on restart, which is fine since
 * the detection window is only a few seconds.
 */
const recentPrefixedMessages = new Map()

/** Replies arriving within this many seconds of a prefixed message are flagged. */
const BOT_REPLY_THRESHOLD_S = 2

/** Discard tracked entries older than this (seconds). Memory guard only — detection
 *  timing is the primary filter. */
const TRACK_TTL_S = 10

setInterval(() => {
    const nowMs = Date.now()
    const nowS = Math.floor(nowMs / 1000)

    for (const [key, availableAt] of cooldowns) {
        if (availableAt <= nowMs) cooldowns.delete(key)
    }

    for (const [msgId, record] of recentPrefixedMessages) {
        if (nowS - record.timestampS > TRACK_TTL_S) recentPrefixedMessages.delete(msgId)
    }
}, 60_000).unref()

module.exports = async (sock, msg) => {
    try {
        // AntiBot runs on every message — before prefix filtering — so it can
        // intercept replies from JIDs that don't themselves send commands.
        await checkAntiBot(sock, msg)

        const ctx = buildContext(sock, msg)
        if (!ctx) return

        // Record this prefixed message so incoming replies can be timed against it.
        trackPrefixedMessage(msg, ctx)

        if (ctx.command === 'menu' || ctx.command === 'help') {
            await sendHelp(ctx)
            return
        }

        const entry = findCommand(ctx.command)
        if (!entry) {
            await sock.sendMessage(ctx.from, {
                text: `❌ Unknown command: *${ctx.command}*\nType *${config.prefix}menu* to see all commands.`
            }, { quoted: msg })
            return
        }

        if (await isCoolingDown(ctx, entry)) return

        const charged = await chargeForCommand(ctx, entry)
        if (charged === false) return

        console.log(`[CMD] ${ctx.command} -> ${entry.name} | From: ${ctx.senderNumber} | Group: ${ctx.isGroup}`)
        try {
            await entry.handler(ctx)
        } catch (err) {
            if (charged > 0) economy.refund(ctx, charged)
            throw err
        }
    } catch (err) {
        console.error('[ERROR] messageHandler:', err)
    }
}

/**
 * Stores a prefixed message in the tracking map so replies to it can be
 * correlated and timed.
 *
 * @param {import('@whiskeysockets/baileys').WAMessage} msg
 * @param {{ isGroup: boolean, from: string, sender: string }} ctx
 */
function trackPrefixedMessage(msg, ctx) {
    if (!ctx.isGroup) return

    const msgId = msg.key.id
    if (!msgId) return

    recentPrefixedMessages.set(msgId, {
        timestampS: Number(msg.messageTimestamp),
        groupId: ctx.from,
        senderJid: ctx.sender
    })
}

/**
 * Detects suspected bots by checking whether an incoming message is a reply
 * to a recently tracked prefixed message and arrived within BOT_REPLY_THRESHOLD_S.
 *
 * Exemptions (will NOT kick):
 *   - Non-group messages
 *   - antiBot not enabled for the group
 *   - Not a reply, or not a reply to a tracked prefixed message
 *   - Reply arrived too slowly to be suspicious
 *   - Replier is the bot itself
 *   - Replier is the original command sender
 *   - Replier is a group admin
 *   - Bot is not admin (can't kick)
 *
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {import('@whiskeysockets/baileys').WAMessage} msg
 */
async function checkAntiBot(sock, msg) {
    const from = msg.key.remoteJid
    if (!from?.endsWith('@g.us')) return

    const settings = getGroupSettings(from)
    if (!settings.antiBot) return

    // Must be a reply
    const repliedToId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId
    if (!repliedToId) return

    // Must be a reply to a prefixed message we're tracking
    const original = recentPrefixedMessages.get(repliedToId)
    if (!original) return

    const replyTimestampS = Number(msg.messageTimestamp)
    const elapsed = replyTimestampS - original.timestampS
    if (elapsed >= BOT_REPLY_THRESHOLD_S) return

    const replierJid = msg.key.participant
    if (!replierJid) return

    // Never flag the bot itself
    const botJid = sock.user?.id
    if (botJid && normalizeJid(replierJid) === normalizeJid(botJid)) return

    // Never flag the person who sent the original command — a fast follow-up
    // from the same user isn't suspicious
    if (normalizeJid(replierJid) === normalizeJid(original.senderJid)) return

    // Never flag group admins — they may run bots legitimately
    if (await isAdmin(sock, from, replierJid)) return

    // Bot must be admin to kick
    if (!await isBotAdmin(sock, from)) return

    try {
        await sock.groupParticipantsUpdate(from, [replierJid], 'remove')
        await sock.sendMessage(from, {
            text: `🤖 @${replierJid.split('@')[0]} was removed — responded to a command in *${elapsed}s*, which looks like automated behaviour.`,
            mentions: [replierJid]
        })
        console.log(`[ANTIBOT] Kicked suspected bot ${replierJid} in ${from} (replied in ${elapsed}s)`)
    } catch (err) {
        console.error('[ANTIBOT] Kick failed:', err.message)
    }
}

async function chargeForCommand(ctx, entry) {
    if (!entry.cost) return 0
    const result = economy.charge(ctx, entry.cost)
    if (result.ok) return result.charged
    await ctx.sock.sendMessage(ctx.from, {
        text: `❌ *${config.prefix}${entry.name}* costs *${entry.cost} coins*, but you only have *${result.balance} coins* in this group.\nEarn more with *${config.prefix}daily* or *${config.prefix}work*.`
    }, { quoted: ctx.msg })
    return false
}

function buildContext(sock, msg) {
    const from = msg.key.remoteJid
    if (!from) return null

    const isGroup = from.endsWith('@g.us')
    const sender = isGroup ? msg.key.participant : msg.key.remoteJid
    if (!sender) return null

    const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        ''

    if (!body.startsWith(config.prefix)) return null

    const rawArgs = body.slice(config.prefix.length).trim()
    if (!rawArgs) return null

    const args = rawArgs.split(/\s+/)
    const command = args.shift().toLowerCase()
    const text = args.join(' ')
    const senderNumber = normalizeJid(sender).replace(/\D/g, '')
    const ownerNumber = String(config.ownerNumber || '').replace(/\D/g, '')
    const isOwner = senderNumber === ownerNumber

    return {
        sock,
        msg,
        from,
        sender,
        senderNumber,
        isGroup,
        isOwner,
        args,
        text,
        command,
        body
    }
}

async function sendHelp(ctx) {
    const requestedCommand = ctx.args[0]

    if (requestedCommand) {
        const text = renderSpecialHelp(requestedCommand) || renderCommandHelp(requestedCommand, config.prefix)
        await ctx.sock.sendMessage(ctx.from, {
            text: text || `❌ Command *${requestedCommand}* not found.\nType *${config.prefix}menu* to see all commands.`
        }, { quoted: ctx.msg })
        return
    }

    const pushname = ctx.msg.pushName || 'friend'
    const balance = economy.getBalance(ctx)
    const status = ctx.isOwner ? 'owner' : 'user'

    const menu = renderMenu({
        prefix: config.prefix,
        botName: config.botName,
        pushname,
        balance,
        status
    })

    await ctx.sock.sendMessage(ctx.from, { text: menu }, { quoted: ctx.msg })
}

function renderSpecialHelp(command) {
    const name = String(command || '').toLowerCase()
    if (name !== 'help' && name !== 'menu') return null

    return `*${config.prefix}menu*\nShow the full command menu.\n\nUsage: *${config.prefix}menu*\nAliases: *${config.prefix}help*\n\nUse *${config.prefix}help <command>* for command-specific details.`
}

async function isCoolingDown(ctx, entry) {
    if (!entry.cooldownMs || ctx.isOwner) return false

    const key = `${entry.name}:${ctx.from}:${ctx.sender}`
    const now = Date.now()
    const availableAt = cooldowns.get(key) || 0

    if (availableAt > now) {
        const seconds = Math.ceil((availableAt - now) / 1000)
        await ctx.sock.sendMessage(ctx.from, {
            text: `⏳ Please wait *${seconds}s* before using *${config.prefix}${entry.name}* again.`
        }, { quoted: ctx.msg })
        return true
    }

    cooldowns.set(key, now + entry.cooldownMs)
    return false
}
