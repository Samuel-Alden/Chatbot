const { isAdmin, isBotAdmin, getMentions, toJID } = require('../utils/helper')
const { phoneOf, phonesOf } = require('../utils/jids')
const db = require('../utils/db')

// Persistent data
const warnings = db.load('warnings')
const groupSettings = db.load('groupSettings')

// Non-persistent (resets on restart intentionally)
const afkList = {}

function getGroupSettings(groupId) {
    return groupSettings[groupId] || {}
}

const WARN_MAX = 3

// Increment a warning for `targetJid` in `groupId`. If they hit WARN_MAX,
// the bot tries to kick (best-effort — needs bot to be admin) and resets
// the count. Returns { count, max, kicked }.
async function addWarning(sock, groupId, targetJid) {
    if (!warnings[groupId]) warnings[groupId] = {}
    warnings[groupId][targetJid] = (warnings[groupId][targetJid] || 0) + 1
    db.save('warnings', warnings)

    const count = warnings[groupId][targetJid]
    let kicked = false

    if (count >= WARN_MAX) {
        try {
            if (await isBotAdmin(sock, groupId)) {
                await sock.groupParticipantsUpdate(groupId, [targetJid], 'remove')
                kicked = true
            }
        } catch (err) {
            console.error('[addWarning] kick failed:', err.message)
        }
        warnings[groupId][targetJid] = 0
        db.save('warnings', warnings)
    }

    return { count, max: WARN_MAX, kicked }
}

module.exports = {
    getGroupSettings,
    addWarning,

    kick: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin to kick members!' }, { quoted: msg })

        const mentions = getMentions(msg)
        if (!mentions.length) return sock.sendMessage(from, { text: '❌ Tag the person you want to kick!\nExample: *!kick @user*' }, { quoted: msg })

        await sock.groupParticipantsUpdate(from, mentions, 'remove')
        await sock.sendMessage(from, { text: `✅ Kicked ${mentions.length} member(s)!`, mentions }, { quoted: msg })
    },

    add: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin to add members!' }, { quoted: msg })
        if (!text) return sock.sendMessage(from, { text: '❌ Provide a number!\nExample: *!add 628xxxxxxxxxx*' }, { quoted: msg })

        const digits = text.replace(/\D/g, '')
        if (digits.length < 8 || digits.length > 15) {
            return sock.sendMessage(from, { text: '❌ Invalid phone number!' }, { quoted: msg })
        }

        const jid = toJID(digits)
        await sock.groupParticipantsUpdate(from, [jid], 'add')
        await sock.sendMessage(from, { text: `✅ Added ${digits} to the group!` }, { quoted: msg })
    },

    promote: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin to promote!' }, { quoted: msg })

        const mentions = getMentions(msg)
        if (!mentions.length) return sock.sendMessage(from, { text: '❌ Tag the person you want to promote!' }, { quoted: msg })

        await sock.groupParticipantsUpdate(from, mentions, 'promote')
        await sock.sendMessage(from, { text: `✅ Promoted ${mentions.length} member(s) to admin!`, mentions }, { quoted: msg })
    },

    demote: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin to demote!' }, { quoted: msg })

        const mentions = getMentions(msg)
        if (!mentions.length) return sock.sendMessage(from, { text: '❌ Tag the person you want to demote!' }, { quoted: msg })

        await sock.groupParticipantsUpdate(from, mentions, 'demote')
        await sock.sendMessage(from, { text: `✅ Demoted ${mentions.length} member(s)!`, mentions }, { quoted: msg })
    },

    mute: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin to mute!' }, { quoted: msg })

        await sock.groupSettingUpdate(from, 'announcement')
        await sock.sendMessage(from, { text: '🔇 Group muted! Only admins can send messages.' }, { quoted: msg })
    },

    unmute: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin to unmute!' }, { quoted: msg })

        await sock.groupSettingUpdate(from, 'not_announcement')
        await sock.sendMessage(from, { text: '🔊 Group unmuted! Everyone can send messages.' }, { quoted: msg })
    },

    tagAll: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        const metadata = await sock.groupMetadata(from)
        // Prefer p.phoneNumber when baileys has resolved the LID, else fall through.
        const members = metadata.participants.map(p => p.phoneNumber || p.id)
        const mentions = members.map(m => `@${m.split('@')[0]}`).join(' ')

        await sock.sendMessage(from, {
            text: `📢 *Attention everyone!*\n\n${mentions}`,
            mentions: members
        }, { quoted: msg })
    },

    groupInfo: async ({ sock, from, msg, isGroup }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const metadata = await sock.groupMetadata(from)
        const admins = metadata.participants
            .filter(p => p.admin)
            .map(p => `@${(p.phoneNumber || p.id).split('@')[0]}`)
            .join('\n  ')
        const totalMembers = metadata.participants.length
        const totalAdmins = metadata.participants.filter(p => p.admin).length
        const createdAt = new Date(metadata.creation * 1000).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })

        const text = `
╔══════════════════╗
║   *GROUP INFO*   ║
╚══════════════════╝

📋 *Name:* ${metadata.subject}
👥 *Members:* ${totalMembers}
👑 *Admins:* ${totalAdmins}
📅 *Created:* ${createdAt}
🔒 *Restrict:* ${metadata.restrict ? 'On' : 'Off'}
📝 *Announce:* ${metadata.announce ? 'On' : 'Off'}

👑 *Admin List:*
  ${admins}

📄 *Description:*
${metadata.desc || 'No description'}
        `.trim()

        await sock.sendMessage(from, { text }, { quoted: msg })
    },

    hideTag: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        const metadata = await sock.groupMetadata(from)
        const members = metadata.participants.map(p => p.id)

        await sock.sendMessage(from, {
            text: text || '📢 Announcement',
            mentions: members
        }, { quoted: msg })
    },

    welcome: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (!text || !['on', 'off'].includes(text.toLowerCase())) {
            return sock.sendMessage(from, { text: '❌ Usage: *!welcome on* or *!welcome off*' }, { quoted: msg })
        }

        if (!groupSettings[from]) groupSettings[from] = {}
        groupSettings[from].welcome = text.toLowerCase() === 'on'
        db.save('groupSettings', groupSettings)

        await sock.sendMessage(from, {
            text: `✅ Welcome messages turned *${text.toLowerCase()}*!`
        }, { quoted: msg })
    },

    setWelcome: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!text) return sock.sendMessage(from, {
            text: '❌ Please provide a welcome message!\nExample: *!setwelcome Welcome to the group, @user!*\n\nVariables:\n*@user* — mentions the new member'
        }, { quoted: msg })

        if (!groupSettings[from]) groupSettings[from] = {}
        groupSettings[from].welcomeMessage = text
        db.save('groupSettings', groupSettings)

        await sock.sendMessage(from, { text: `✅ Welcome message set!\n\nPreview:\n${text.replace('@user', '@example')}` }, { quoted: msg })
    },

    antiLink: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (!text || !['on', 'off'].includes(text.toLowerCase())) {
            return sock.sendMessage(from, { text: '❌ Usage: *!antilink on* or *!antilink off*' }, { quoted: msg })
        }

        if (!groupSettings[from]) groupSettings[from] = {}
        groupSettings[from].antiLink = text.toLowerCase() === 'on'
        db.save('groupSettings', groupSettings)

        await sock.sendMessage(from, {
            text: `✅ Anti-link turned *${text.toLowerCase()}*! ${text === 'on' ? 'Links sent by non-admins will be deleted.' : ''}`
        }, { quoted: msg })
    },

    warn: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin to warn members!' }, { quoted: msg })

        const mentions = getMentions(msg)
        if (!mentions.length) return sock.sendMessage(from, { text: '❌ Tag the person you want to warn!\nExample: *!warn @user*' }, { quoted: msg })

        const target = mentions[0]
        const result = await addWarning(sock, from, target)
        const pn = await phoneOf(sock, target, from)

        if (result.kicked) {
            await sock.sendMessage(from, {
                text: `⚠️ @${pn.split('@')[0]} has reached *${result.max} warnings* and has been kicked!`,
                mentions: [pn]
            }, { quoted: msg })
        } else {
            await sock.sendMessage(from, {
                text: `⚠️ Warning *${result.count}/${result.max}* for @${pn.split('@')[0]}!\nNext warning will result in a kick.`,
                mentions: [pn]
            }, { quoted: msg })
        }
    },

    resetWarn: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        const mentions = getMentions(msg)
        if (!mentions.length) return sock.sendMessage(from, { text: '❌ Tag the person to reset warnings!\nExample: *!resetwarn @user*' }, { quoted: msg })

        const target = mentions[0]
        if (warnings[from]) warnings[from][target] = 0
        db.save('warnings', warnings)
        const pn = await phoneOf(sock, target, from)

        await sock.sendMessage(from, {
            text: `✅ Warnings reset for @${pn.split('@')[0]}!`,
            mentions: [pn]
        }, { quoted: msg })
    },

    listWarn: async ({ sock, from, msg, isGroup }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const groupWarns = warnings[from] || {}
        const entries = Object.entries(groupWarns).filter(([, count]) => count > 0)

        if (!entries.length) return sock.sendMessage(from, { text: '✅ No warned members in this group!' }, { quoted: msg })

        const pns = await phonesOf(sock, entries.map(([jid]) => jid), from)
        const list = entries.map(([, count], i) => `@${pns[i].split('@')[0]} — ${count}/3 warnings`).join('\n')

        await sock.sendMessage(from, {
            text: `⚠️ *Warned Members:*\n\n${list}`,
            mentions: pns
        }, { quoted: msg })
    },

    kickMe: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin to kick members!' }, { quoted: msg })

        await sock.sendMessage(from, { text: '👋 Goodbye!', mentions: [sender] }, { quoted: msg })
        await sock.groupParticipantsUpdate(from, [sender], 'remove')
    },

    linkGc: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        const code = await sock.groupInviteCode(from)
        await sock.sendMessage(from, {
            text: `🔗 *Group Invite Link:*\nhttps://chat.whatsapp.com/${code}`
        }, { quoted: msg })
    },

    revokeLink: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin to revoke the link!' }, { quoted: msg })

        await sock.groupRevokeInvite(from)
        await sock.sendMessage(from, { text: '✅ Group invite link has been revoked! A new link has been generated.' }, { quoted: msg })
    },

    setNameGc: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin to change the group name!' }, { quoted: msg })
        if (!text) return sock.sendMessage(from, { text: '❌ Please provide a name!\nExample: *!setnamegc My Awesome Group*' }, { quoted: msg })

        await sock.groupUpdateSubject(from, text)
        await sock.sendMessage(from, { text: `✅ Group name changed to: *${text}*` }, { quoted: msg })
    },

    setDescGc: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin to change the description!' }, { quoted: msg })
        if (!text) return sock.sendMessage(from, { text: '❌ Please provide a description!\nExample: *!setdescgc This is our group!*' }, { quoted: msg })

        await sock.groupUpdateDescription(from, text)
        await sock.sendMessage(from, { text: `✅ Group description updated!` }, { quoted: msg })
    },

    setOpen: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin!' }, { quoted: msg })

        await sock.groupSettingUpdate(from, 'not_announcement')
        await sock.sendMessage(from, { text: '🔓 Group is now *open*! All members can send messages.' }, { quoted: msg })
    },

    setClose: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin!' }, { quoted: msg })

        await sock.groupSettingUpdate(from, 'announcement')
        await sock.sendMessage(from, { text: '🔒 Group is now *closed*! Only admins can send messages.' }, { quoted: msg })
    },

    pinMsg: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin to pin messages!' }, { quoted: msg })

        const ctx = msg.message?.extendedTextMessage?.contextInfo
        if (!ctx?.stanzaId) return sock.sendMessage(from, { text: '❌ Please reply to a message to pin it!' }, { quoted: msg })

        const targetKey = {
            remoteJid: from,
            fromMe: false,
            id: ctx.stanzaId,
            participant: ctx.participant
        }
        await sock.sendMessage(from, { pin: targetKey, type: 1, time: 604800 })
        await sock.sendMessage(from, { text: '📌 Message pinned!' }, { quoted: msg })
    },

    unpinMsg: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin to unpin messages!' }, { quoted: msg })

        const ctx = msg.message?.extendedTextMessage?.contextInfo
        if (!ctx?.stanzaId) return sock.sendMessage(from, { text: '❌ Please reply to the pinned message to unpin it!' }, { quoted: msg })

        const targetKey = {
            remoteJid: from,
            fromMe: false,
            id: ctx.stanzaId,
            participant: ctx.participant
        }
        await sock.sendMessage(from, { pin: targetKey, type: 0 })
        await sock.sendMessage(from, { text: '📌 Message unpinned!' }, { quoted: msg })
    },

    deleteMsg: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!await isBotAdmin(sock, from)) return sock.sendMessage(from, { text: '❌ I need to be an admin to delete messages!' }, { quoted: msg })

        const ctx = msg.message?.extendedTextMessage?.contextInfo
        if (!ctx?.stanzaId) return sock.sendMessage(from, { text: '❌ Please reply to the message you want to delete!' }, { quoted: msg })

        await sock.sendMessage(from, {
            delete: {
                remoteJid: from,
                fromMe: false,
                id: ctx.stanzaId,
                participant: ctx.participant
            }
        })
    },

    leaveGc: async ({ sock, from, msg, isGroup, isOwner }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!isOwner) return sock.sendMessage(from, { text: '❌ Only the bot owner can use this!' }, { quoted: msg })

        await sock.sendMessage(from, { text: '👋 Goodbye everyone! The bot is leaving this group.' })
        await sock.groupLeave(from)
    },

    groupAdmin: async ({ sock, from, msg, isGroup }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const metadata = await sock.groupMetadata(from)
        const admins = metadata.participants.filter(p => p.admin)

        if (!admins.length) return sock.sendMessage(from, { text: '❌ No admins found!' }, { quoted: msg })

        const adminJids = admins.map(a => a.phoneNumber || a.id)
        const list = admins.map((a, i) => `👑 @${adminJids[i].split('@')[0]} ${a.admin === 'superadmin' ? '*(Owner)*' : ''}`).join('\n')

        await sock.sendMessage(from, {
            text: `👑 *Group Admins (${admins.length}):*\n\n${list}`,
            mentions: adminJids
        }, { quoted: msg })
    },

    antiDelete: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (!text || !['on', 'off'].includes(text.toLowerCase())) {
            return sock.sendMessage(from, { text: '❌ Usage: *!antidelete on* or *!antidelete off*' }, { quoted: msg })
        }

        if (!groupSettings[from]) groupSettings[from] = {}
        groupSettings[from].antiDelete = text.toLowerCase() === 'on'
        db.save('groupSettings', groupSettings)

        await sock.sendMessage(from, {
            text: `✅ Anti-delete turned *${text.toLowerCase()}*!`
        }, { quoted: msg })
    },

    antiBadWord: async ({ sock, from, msg, isGroup, sender, text, args }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (!text || !['on', 'off'].includes(args[0]?.toLowerCase())) {
            return sock.sendMessage(from, { text: '❌ Usage: *!antibadword on* or *!antibadword off*' }, { quoted: msg })
        }

        if (!groupSettings[from]) groupSettings[from] = {}
        groupSettings[from].antiBadWord = args[0].toLowerCase() === 'on'
        db.save('groupSettings', groupSettings)

        await sock.sendMessage(from, {
            text: `✅ Anti-bad word turned *${args[0].toLowerCase()}*!`
        }, { quoted: msg })
    },

    addBadWord: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!text) return sock.sendMessage(from, { text: '❌ Please provide a word!\nExample: *!addbadword badword*' }, { quoted: msg })

        if (!groupSettings[from]) groupSettings[from] = {}
        if (!groupSettings[from].badWords) groupSettings[from].badWords = []

        const word = text.toLowerCase().trim()
        if (groupSettings[from].badWords.includes(word)) {
            return sock.sendMessage(from, { text: `❌ *${word}* is already in the bad word list!` }, { quoted: msg })
        }

        groupSettings[from].badWords.push(word)
        db.save('groupSettings', groupSettings)
        await sock.sendMessage(from, { text: `✅ Added *${word}* to the bad word list!` }, { quoted: msg })
    },

    delBadWord: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!text) return sock.sendMessage(from, { text: '❌ Please provide a word to remove!' }, { quoted: msg })

        if (!groupSettings[from]?.badWords?.length) {
            return sock.sendMessage(from, { text: '❌ No bad words in the list!' }, { quoted: msg })
        }

        const word = text.toLowerCase().trim()
        groupSettings[from].badWords = groupSettings[from].badWords.filter(w => w !== word)
        db.save('groupSettings', groupSettings)
        await sock.sendMessage(from, { text: `✅ Removed *${word}* from the bad word list!` }, { quoted: msg })
    },

    listBadWord: async ({ sock, from, msg, isGroup }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const words = groupSettings[from]?.badWords || []
        if (!words.length) return sock.sendMessage(from, { text: '📋 No bad words set for this group!' }, { quoted: msg })

        await sock.sendMessage(from, {
            text: `🚫 *Bad Word List:*\n\n${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}`
        }, { quoted: msg })
    },

    resetBadWord: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (groupSettings[from]) groupSettings[from].badWords = []
        db.save('groupSettings', groupSettings)
        await sock.sendMessage(from, { text: '✅ Bad word list has been reset!' }, { quoted: msg })
    },

    afk: async ({ sock, from, msg, sender, text }) => {
        if (afkList[sender]) {
            return sock.sendMessage(from, {
                text: `😴 You're already AFK!\nReason: ${afkList[sender].reason}\n\nJust send any message to return!`
            }, { quoted: msg })
        }

        afkList[sender] = {
            reason: text || 'No reason given',
            time: Date.now()
        }

        await sock.sendMessage(from, {
            text: `😴 You are now *AFK*!\nReason: ${text || 'No reason given'}\n\nSend any message to return.`
        }, { quoted: msg })
    },

    setLeft: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!text) return sock.sendMessage(from, {
            text: '❌ Please provide a goodbye message!\nExample: *!setleft Goodbye @user!*\n\nVariables:\n*@user* — mentions the leaving member'
        }, { quoted: msg })

        if (!groupSettings[from]) groupSettings[from] = {}
        groupSettings[from].leftMessage = text
        db.save('groupSettings', groupSettings)

        await sock.sendMessage(from, { text: `✅ Goodbye message set!\n\nPreview:\n${text.replace('@user', '@example')}` }, { quoted: msg })
    },

    antiBot: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (!text || !['on', 'off'].includes(text.toLowerCase())) {
            return sock.sendMessage(from, { text: '❌ Usage: *!antibot on* or *!antibot off*' }, { quoted: msg })
        }

        if (!groupSettings[from]) groupSettings[from] = {}
        groupSettings[from].antiBot = text.toLowerCase() === 'on'
        db.save('groupSettings', groupSettings)

        await sock.sendMessage(from, {
            text: `✅ Anti-bot turned *${text.toLowerCase()}*! ${text === 'on' ? 'Other bots will be kicked automatically.' : ''}`
        }, { quoted: msg })
    },

    descGc: async ({ sock, from, msg, isGroup }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const metadata = await sock.groupMetadata(from)
        await sock.sendMessage(from, {
            text: `📝 *Group Description:*\n\n${metadata.desc || 'No description set.'}`
        }, { quoted: msg })
    },

    refreshGroup: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        const metadata = await sock.groupMetadata(from)
        await sock.sendMessage(from, {
            text: `🔄 *Group Refreshed!*\n\n📋 Name: ${metadata.subject}\n👥 Members: ${metadata.participants.length}\n👑 Admins: ${metadata.participants.filter(p => p.admin).length}`
        }, { quoted: msg })
    },

    afkList,
    getGroupSettings,
    groupSettings
}