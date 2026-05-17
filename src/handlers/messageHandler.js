const config = require('../config')
const { normalizeJid } = require('../utils/helper')
const { findCommand, renderMenu, renderCommandHelp } = require('./commandRegistry')
const economy = require('../commands/economy')

const cooldowns = new Map()

setInterval(() => {
    const now = Date.now()
    for (const [key, availableAt] of cooldowns) {
        if (availableAt <= now) cooldowns.delete(key)
    }
}, 60_000).unref()

module.exports = async (sock, msg) => {
    try {
        const ctx = buildContext(sock, msg)
        if (!ctx) return

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
