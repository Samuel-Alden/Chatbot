const { Boom } = require('@hapi/boom')
const pino = require('pino')
const fs = require('fs')
const path = require('path')
const messageHandler = require('./src/handlers/messageHandler')
const { isAdmin, isBotAdmin, normalizeJid } = require('./src/utils/helper')
const { getGroupSettings, afkList, addWarning } = require('./src/commands/group')
const { blacklists } = require('./src/commands/blacklist')
const economy = require('./src/commands/economy')

const BADWORD_FINE = 50
const alarm = require('./src/commands/alarm')
const reminder = require('./src/commands/reminder')
const totalpesan = require('./src/commands/totalpesan')
const config = require('./src/config')
const { loadBaileys } = require('./src/utils/baileys')
const { findBadWords } = require('./src/utils/badwords')
const { phoneOf, phonesOf } = require('./src/utils/jids')
const tebaklagukpop = require('./src/commands/tebaklagukpop')
const tebakanime = require('./src/commands/tebakanime')

require('dotenv').config({ quiet: true })

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

const RECENT_MESSAGE_TTL_MS = 6 * 60 * 60_000
const RECENT_MESSAGE_MAX = 2_000
const DELETE_DEDUPE_TTL_MS = 60_000
const DELETE_PREVIEW_MAX_CHARS = 1_200

const recentGroupMessages = new Map()
const handledDeletes = new Map()

setInterval(() => {
    const now = Date.now()
    for (const [key, cached] of recentGroupMessages) {
        if (cached.expiresAt <= now) recentGroupMessages.delete(key)
    }
    for (const [key, expiresAt] of handledDeletes) {
        if (expiresAt <= now) handledDeletes.delete(key)
    }
}, 60_000).unref()

function messageCacheKey(remoteJid, id) {
    return `${remoteJid}:${id}`
}

function rememberRecentGroupMessage(msg) {
    const remoteJid = msg.key.remoteJid
    if (!remoteJid?.endsWith('@g.us') || !msg.key.id || !msg.message) return

    const summary = summarizeMessage(msg.message)
    if (!summary.type || summary.type === 'deleted' || summary.type === 'reaction') return

    recentGroupMessages.set(messageCacheKey(remoteJid, msg.key.id), {
        sender: msg.key.participant || msg.key.remoteJid,
        type: summary.type,
        text: summary.text,
        expiresAt: Date.now() + RECENT_MESSAGE_TTL_MS
    })

    if (recentGroupMessages.size > RECENT_MESSAGE_MAX) {
        const oldestKey = recentGroupMessages.keys().next().value
        if (oldestKey) recentGroupMessages.delete(oldestKey)
    }
}

function unwrapMessage(message) {
    let current = message
    while (current) {
        if (current.ephemeralMessage?.message) {
            current = current.ephemeralMessage.message
            continue
        }
        if (current.viewOnceMessage?.message) {
            current = current.viewOnceMessage.message
            continue
        }
        if (current.viewOnceMessageV2?.message) {
            current = current.viewOnceMessageV2.message
            continue
        }
        if (current.viewOnceMessageV2Extension?.message) {
            current = current.viewOnceMessageV2Extension.message
            continue
        }
        if (current.documentWithCaptionMessage?.message) {
            current = current.documentWithCaptionMessage.message
            continue
        }
        break
    }
    return current || message
}

function summarizeMessage(message) {
    const msg = unwrapMessage(message)
    if (!msg) return { type: '', text: '' }

    const text =
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.documentMessage?.caption ||
        msg.pollCreationMessage?.name ||
        ''

    if (msg.conversation || msg.extendedTextMessage?.text) {
        return { type: 'text', text: trimPreview(text) }
    }
    if (msg.imageMessage) return { type: 'image', text: trimPreview(text) }
    if (msg.videoMessage) return { type: 'video', text: trimPreview(text) }
    if (msg.stickerMessage) return { type: 'sticker', text: '' }
    if (msg.audioMessage) return { type: 'audio', text: '' }
    if (msg.documentMessage) return { type: 'document', text: trimPreview(text) }
    if (msg.contactMessage || msg.contactsArrayMessage) return { type: 'contact', text: '' }
    if (msg.locationMessage || msg.liveLocationMessage) return { type: 'location', text: '' }
    if (msg.pollCreationMessage) return { type: 'poll', text: trimPreview(text) }
    if (msg.reactionMessage) return { type: 'reaction', text: '' }
    if (msg.protocolMessage) return { type: 'deleted', text: '' }

    const type = Object.keys(msg)[0] || 'message'
    return { type, text: trimPreview(text) }
}

function trimPreview(text) {
    const cleaned = String(text || '').trim()
    if (!cleaned) return ''
    return cleaned.length > DELETE_PREVIEW_MAX_CHARS
        ? `${cleaned.slice(0, DELETE_PREVIEW_MAX_CHARS)}\n\n_(truncated)_`
        : cleaned
}

function humanMessageType(type) {
    return {
        text: 'text',
        image: 'image',
        video: 'video',
        sticker: 'sticker',
        audio: 'audio',
        document: 'document',
        contact: 'contact',
        location: 'location',
        poll: 'poll'
    }[type] || type || 'message'
}

function isBotJid(sock, jid) {
    if (!jid) return false
    const clean = normalizeJid(jid)
    return clean === normalizeJid(sock.user?.id) || clean === normalizeJid(sock.user?.lid || '')
}

async function checkActiveGuessGames({ sock, msg, from, sender, body }) {
    const handlers = [
        tebaklagukpop.checkGuess,
        tebakanime.checkGuess
    ]

    for (const checkGuess of handlers) {
        const handled = await checkGuess({ sock, msg, from, sender, body })
        if (handled) return true
    }

    return false
}

async function reportDeletedMessage(sock, groupId, deletedKey, actorJid) {
    if (!groupId?.endsWith('@g.us') || !deletedKey?.id) return
    const settings = getGroupSettings(groupId)
    if (!settings.antiDelete) return

    const dedupeKey = messageCacheKey(groupId, deletedKey.id)
    const now = Date.now()
    if ((handledDeletes.get(dedupeKey) || 0) > now) return
    handledDeletes.set(dedupeKey, now + DELETE_DEDUPE_TTL_MS)

    if (actorJid && isBotJid(sock, actorJid)) return

    const cached = recentGroupMessages.get(dedupeKey)
    const senderJid = cached?.sender || deletedKey.participant || actorJid
    if (senderJid && isBotJid(sock, senderJid)) return

    const senderPn = senderJid ? await phoneOf(sock, senderJid, groupId).catch(() => senderJid) : null
    const actorPn = actorJid ? await phoneOf(sock, actorJid, groupId).catch(() => actorJid) : null

    if (actorPn && isBotJid(sock, actorPn)) return

    const mentions = []
    const lines = []
    if (actorPn && senderPn && normalizeJid(actorPn) !== normalizeJid(senderPn)) {
        lines.push(`🗑️ @${actorPn.split('@')[0]} deleted a message from @${senderPn.split('@')[0]}.`)
        mentions.push(actorPn, senderPn)
    } else if (senderPn) {
        lines.push(`🗑️ @${senderPn.split('@')[0]} deleted a message.`)
        mentions.push(senderPn)
    } else if (actorPn) {
        lines.push(`🗑️ @${actorPn.split('@')[0]} deleted a message.`)
        mentions.push(actorPn)
    } else {
        lines.push('🗑️ A message was deleted.')
    }

    if (cached) {
        lines.push(`Type: *${humanMessageType(cached.type)}*`)
        if (cached.text) {
            lines.push(`Message:\n${cached.text}`)
        } else {
            lines.push('Message: _No text preview available._')
        }
    } else {
        lines.push('Message: _Original content was not available in cache._')
    }

    await sock.sendMessage(groupId, {
        text: lines.join('\n\n'),
        mentions: [...new Set(mentions)]
    })
}

async function startBot() {
    const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        fetchLatestBaileysVersion,
        WAMessageStubType
    } = await loadBaileys()
    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`Using WA web version v${version.join('.')} (latest: ${isLatest})`)

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        syncFullHistory: false,
        logger: pino({ level: process.env.LOG_LEVEL || 'warn' }),
        browser: ['Riwoo Bot', 'Chrome', '120.0.0']
    })

    if (!sock.creds?.registered) {
    const phoneNumber = 6287896290099

    setTimeout(async () => {
        try {
            const code = await sock.requestPairingCode(phoneNumber)
            console.log(`\n📱 Your pairing code: ${code}\n`)
        } catch (err) {
            console.error('Failed to get pairing code:', err)
        }
    }, 3000)
}

    alarm.setSock(sock)
    reminder.setSock(sock)

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update

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
            for (const item of messages) {
                if (item?.message) rememberRecentGroupMessage(item)
            }
            const msg = messages[0]
            if (!msg.message) return

            const from = msg.key.remoteJid
            if (!from) return
            const isGroup = from.endsWith('@g.us')
            const msgSender = isGroup ? msg.key.participant : msg.key.remoteJid
            if (!msgSender) return
            const body =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text || ''
            const trimmedBody = (body || '').trim()

            // Let the paired owner account participate in plain-text guessing games,
            // but keep ignoring the bot's other non-command self messages so it
            // doesn't loop on its own output.
            if (msg.key.fromMe && !trimmedBody.startsWith(config.prefix)) {
                const handled = await checkActiveGuessGames({
                    sock, msg, from, sender: msgSender, body: trimmedBody
                })
                if (handled) return
                return
            }

            const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []

            // Auto-return from AFK when user sends any message (skip if it's the !afk command)
            const isAfkCommand = body.toLowerCase().startsWith(`${config.prefix}afk`)
            if (afkList[msgSender] && !isAfkCommand) {
                const afkData = afkList[msgSender]
                const duration = Math.floor((Date.now() - afkData.time) / 1000)
                const mins = Math.floor(duration / 60)
                const secs = duration % 60

                try {
                    const pn = await phoneOf(sock, msgSender, isGroup ? from : null)
                    await sock.sendMessage(from, {
                        text: `👋 Welcome back @${pn.split('@')[0]}! You were AFK for *${mins}m ${secs}s*`,
                        mentions: [pn]
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
                    const pn = await phoneOf(sock, jid, isGroup ? from : null)
                    await sock.sendMessage(from, {
                        text: `😴 @${pn.split('@')[0]} is currently AFK\nReason: ${afkData.reason}\nDuration: ${mins}m ${secs}s`,
                        mentions: [pn]
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
                            const pn = await phoneOf(sock, msgSender, from)
                            await sock.sendMessage(from, {
                                text: `🚫 Links are not allowed in this group, @${pn.split('@')[0]}!`,
                                mentions: [pn]
                            })
                            return
                        }
                    }
                }

                // Anti-bad word: applies to everyone except the bot owner.
                // Deletes the message, fines coins, adds a warning (auto-kicks at WARN_MAX).
                if (settings.antiBadWord) {
                    const found = findBadWords(body, settings.badWords)
                    if (found.length) {
                        const senderDigits = normalizeJid(msgSender).replace(/\D/g, '')
                        const ownerDigits = String(config.ownerNumber || '').replace(/\D/g, '')
                        const isOwnerSender = ownerDigits && senderDigits === ownerDigits

                        if (!isOwnerSender) {
                            await sock.sendMessage(from, { delete: msg.key }).catch(() => {})

                            const fakeCtx = {
                                from,
                                sender: msgSender,
                                senderNumber: senderDigits,
                                isGroup: true,
                                isOwner: false
                            }
                            const fineAmount = BADWORD_FINE * found.length
                            const fine = economy.chargeMax(fakeCtx, fineAmount)
                            const warn = await addWarning(sock, from, msgSender)
                            const pn = await phoneOf(sock, msgSender, from)

                            const lines = [`🚫 @${pn.split('@')[0]}, please don't use bad words! (${found.length} caught: ${found.join(', ')})`]
                            if (fine.charged > 0) {
                                lines.push(`💸 Fined *${fine.charged} coins* (${BADWORD_FINE} × ${found.length}). Balance: *${fine.balance}*.`)
                            }
                            if (warn.kicked) {
                                lines.push(`⚠️ Hit *${warn.max}* warnings — kicked!`)
                            } else {
                                lines.push(`⚠️ Warning *${warn.count}/${warn.max}*. Next one is a kick.`)
                            }

                            await sock.sendMessage(from, {
                                text: lines.join('\n'),
                                mentions: [pn]
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
                    const pn = await phoneOf(sock, msgSender, from)
                    await sock.sendMessage(from, {
                        text: `🚫 @${pn.split('@')[0]} is blacklisted and has been kicked!`,
                        mentions: [pn]
                    })
                    await sock.groupParticipantsUpdate(from, [msgSender], 'remove')
                    return
                }
            }

            // Active games listen for plain (non-command) messages as guesses.
            if (trimmedBody && !trimmedBody.startsWith(config.prefix)) {
                const handled = await checkActiveGuessGames({
                    sock, msg, from, sender: msgSender, body: trimmedBody
                })
                if (handled) return
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
                    const pn = await phoneOf(sock, participant, id)
                    const welcomeMsg = (settings.welcomeMessage || 'Welcome to the group, @user! 👋')
                        .replace('@user', `@${pn.split('@')[0]}`)
                    await sock.sendMessage(id, {
                        text: welcomeMsg,
                        mentions: [pn]
                    })
                }
            }

            if ((action === 'remove' || action === 'leave') && settings.leftMessage) {
                for (const participant of participants) {
                    const pn = await phoneOf(sock, participant, id)
                    const leftMsg = settings.leftMessage
                        .replace('@user', `@${pn.split('@')[0]}`)
                    await sock.sendMessage(id, {
                        text: leftMsg,
                        mentions: [pn]
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
                        const pn = await phoneOf(sock, participant, id)
                        await sock.sendMessage(id, {
                            text: `🤖 Bot detected and kicked: @${pn.split('@')[0]}`,
                            mentions: [pn]
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
    sock.ev.on('messages.update', async (updates) => {
        try {
            for (const update of updates) {
                if (update.update?.messageStubType !== WAMessageStubType.REVOKE) continue
                const groupId = update.key?.remoteJid
                if (!groupId?.endsWith('@g.us')) continue

                const actorKey = update.update?.key
                const actorJid = actorKey?.participant || (actorKey?.fromMe ? sock.user?.id : null)
                await reportDeletedMessage(sock, groupId, update.key, actorJid)
            }
        } catch (err) {
            console.error('[ERROR] messages.update antiDelete:', err)
        }
    })

    sock.ev.on('messages.delete', async (item) => {
        try {
            if (!('keys' in item)) return
            for (const key of item.keys) {
                const groupId = key.remoteJid
                if (!groupId?.endsWith('@g.us')) continue
                if (!key.participant) continue
                await reportDeletedMessage(sock, groupId, key, key.participant || null)
            }
        } catch (err) {
            console.error('[ERROR] messages.delete:', err)
        }
    })
}

startBot()
