const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('baileys')
const { Boom } = require('@hapi/boom')
const pino = require('pino')
const qrcode = require('qrcode-terminal')
const fs = require('fs')
const path = require('path')
const messageHandler = require('./src/handlers/messageHandler')
const { isAdmin, isBotAdmin, normalizeJid } = require('./src/utils/helper')
const { getGroupSettings, afkList } = require('./src/commands/group')
const { blacklists } = require('./src/commands/blacklist')
const alarm = require('./src/commands/alarm')
const reminder = require('./src/commands/reminder')
const totalpesan = require('./src/commands/totalpesan')
const config = require('./src/config')

require('dotenv').config()

// Drop leftover tmp files from prior crashes
const tmpDir = path.join(__dirname, 'tmp')
if (fs.existsSync(tmpDir)) {
    for (const f of fs.readdirSync(tmpDir)) {
        try { fs.unlinkSync(path.join(tmpDir, f)) } catch {}
    }
}

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err))
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err))

let reconnectAttempts = 0

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`Using WA web version v${version.join('.')} (latest: ${isLatest})`)

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: process.env.LOG_LEVEL || 'warn' }),
        browser: ['Riwoo Bot', 'Chrome', '120.0.0']
    })

    alarm.setSock(sock)
    reminder.setSock(sock)

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            console.log('📱 Scan this QR code with your WhatsApp:')
            qrcode.generate(qr, { small: true })
        }

        if (connection === 'close') {
            const err = lastDisconnect?.error
            const code = (err instanceof Boom) ? err.output?.statusCode : undefined
            const reasonName = Object.entries(DisconnectReason).find(([, v]) => v === code)?.[0]
            console.log(`Connection closed. code=${code} (${reasonName || 'unknown'}) msg=${err?.message}`)

            const shouldReconnect = code !== DisconnectReason.loggedOut
            if (shouldReconnect) {
                const delay = Math.min(60_000, 2_000 * 2 ** reconnectAttempts++)
                console.log(`Waiting ${Math.round(delay / 1000)}s before reconnecting...`)
                setTimeout(() => startBot(), delay)
            } else {
                console.log('Logged out. Delete auth_info/ and restart to re-pair.')
            }
        }

        if (connection === 'open') {
            reconnectAttempts = 0
            console.log('✅ Bot connected successfully!')
        }
    })

    sock.ev.on('creds.update', saveCreds)

    // Main message handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0]
            if (!msg.message) return

            const body =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text || ''

            // Allow the paired number to issue commands, but ignore the bot's own
            // replies — otherwise it would loop on its own output.
            if (msg.key.fromMe && !body.startsWith(config.prefix)) return

            const from = msg.key.remoteJid
            if (!from) return
            const isGroup = from.endsWith('@g.us')
            const msgSender = isGroup ? msg.key.participant : msg.key.remoteJid
            if (!msgSender) return

            const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []

            // Auto-return from AFK when user sends any message (skip if it's the !afk command)
            const isAfkCommand = body.toLowerCase().startsWith(`${config.prefix}afk`)
            if (afkList[msgSender] && !isAfkCommand) {
                const afkData = afkList[msgSender]
                const duration = Math.floor((Date.now() - afkData.time) / 1000)
                const mins = Math.floor(duration / 60)
                const secs = duration % 60

                try {
                    await sock.sendMessage(from, {
                        text: `👋 Welcome back @${msgSender.split('@')[0]}! You were AFK for *${mins}m ${secs}s*`,
                        mentions: [msgSender]
                    })
                } finally {
                    delete afkList[msgSender]
                }
            }

            // AFK mention check
            for (const jid of mentionedJids) {
                if (afkList[jid]) {
                    const afkData = afkList[jid]
                    const duration = Math.floor((Date.now() - afkData.time) / 1000)
                    const mins = Math.floor(duration / 60)
                    const secs = duration % 60
                    await sock.sendMessage(from, {
                        text: `😴 @${jid.split('@')[0]} is currently AFK\nReason: ${afkData.reason}\nDuration: ${mins}m ${secs}s`,
                        mentions: [jid]
                    })
                }
            }

            if (isGroup) {
                const settings = getGroupSettings(from)

                // Anti-link check
                if (settings.antiLink) {
                    const isSenderAdmin = await isAdmin(sock, from, msgSender)
                    if (!isSenderAdmin) {
                        const linkRegex = /(https?:\/\/|www\.)[^\s]+/gi
                        if (linkRegex.test(body)) {
                            await sock.sendMessage(from, { delete: msg.key })
                            await sock.sendMessage(from, {
                                text: `🚫 Links are not allowed in this group, @${msgSender.split('@')[0]}!`,
                                mentions: [msgSender]
                            })
                            return
                        }
                    }
                }

                // Anti-bad word check
                if (settings.antiBadWord && settings.badWords?.length) {
                    const lowerBody = body.toLowerCase()
                    const foundBadWord = settings.badWords.find(w => lowerBody.includes(w))
                    if (foundBadWord) {
                        const isSenderAdmin = await isAdmin(sock, from, msgSender)
                        if (!isSenderAdmin) {
                            await sock.sendMessage(from, { delete: msg.key })
                            await sock.sendMessage(from, {
                                text: `🚫 @${msgSender.split('@')[0]}, please don't use bad words!`,
                                mentions: [msgSender]
                            })
                            return
                        }
                    }
                }

                // Count messages
                totalpesan.increment(from, msgSender)

                // Blacklist enforcement
                const senderNum = normalizeJid(msgSender)
                const bl = blacklists[from] || []
                const isBlacklisted = bl.some(jid => normalizeJid(jid) === senderNum)
                if (isBlacklisted && await isBotAdmin(sock, from)) {
                    await sock.sendMessage(from, {
                        text: `🚫 @${msgSender.split('@')[0]} is blacklisted and has been kicked!`,
                        mentions: [msgSender]
                    })
                    await sock.groupParticipantsUpdate(from, [msgSender], 'remove')
                    return
                }
            }

            // Pass to command handler
            await messageHandler(sock, msg)

        } catch (err) {
            console.error('[ERROR] messages.upsert:', err)
        }
    })

    // Welcome & goodbye messages
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        try {
            const settings = getGroupSettings(id)

            if (action === 'add' && settings.welcome) {
                for (const participant of participants) {
                    const welcomeMsg = (settings.welcomeMessage || 'Welcome to the group, @user! 👋')
                        .replace('@user', `@${participant.split('@')[0]}`)
                    await sock.sendMessage(id, {
                        text: welcomeMsg,
                        mentions: [participant]
                    })
                }
            }

            if ((action === 'remove' || action === 'leave') && settings.leftMessage) {
                for (const participant of participants) {
                    const leftMsg = settings.leftMessage
                        .replace('@user', `@${participant.split('@')[0]}`)
                    await sock.sendMessage(id, {
                        text: leftMsg,
                        mentions: [participant]
                    })
                }
            }

            // Anti-bot: kick obvious WhatsApp Business / bot accounts that join.
            // Note: @lid is a normal linked-device JID for many real users — never use it as a bot signal.
            if (action === 'add' && settings.antiBot) {
                const metadata = await sock.groupMetadata(id).catch(() => null)
                for (const participant of participants) {
                    const member = metadata?.participants?.find(p => p.id === participant)
                    const isBot = member?.isBusiness || /bot/i.test(member?.notify || '')
                    if (isBot) {
                        await sock.sendMessage(id, {
                            text: `🤖 Bot detected and kicked: @${participant.split('@')[0]}`,
                            mentions: [participant]
                        })
                        await sock.groupParticipantsUpdate(id, [participant], 'remove')
                    }
                }
            }
        } catch (err) {
            console.error('[ERROR] group-participants.update:', err)
        }
    })

    // Anti-delete
    sock.ev.on('messages.delete', async (item) => {
        try {
            if (!('keys' in item)) return
            for (const key of item.keys) {
                const groupId = key.remoteJid
                if (!groupId?.endsWith('@g.us')) continue
                const settings = getGroupSettings(groupId)
                if (!settings.antiDelete) continue
                if (!key.participant) continue

                await sock.sendMessage(groupId, {
                    text: `🗑️ @${key.participant.split('@')[0]} deleted a message!`,
                    mentions: [key.participant]
                })
            }
        } catch (err) {
            console.error('[ERROR] messages.delete:', err)
        }
    })
}

startBot()