const db = require('../utils/db')
const { normalizeJid } = require('../utils/helper')

const blacklists = db.load('blacklists')

module.exports = {
    addBlacklist: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin, getMentions } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        const mentions = getMentions(msg)
        if (!mentions.length) return sock.sendMessage(from, {
            text: '❌ Tag the person to blacklist!\nExample: *!blacklist @user*'
        }, { quoted: msg })

        if (!blacklists[from]) blacklists[from] = []

        const added = []
        for (const jid of mentions) {
            const alreadyIn = blacklists[from].some(b => normalizeJid(b) === normalizeJid(jid))
            if (!alreadyIn) {
                blacklists[from].push(jid)
                added.push(jid)
            }
        }

        if (!added.length) return sock.sendMessage(from, { text: '❌ User(s) already blacklisted!' }, { quoted: msg })

        db.save('blacklists', blacklists)
        await sock.sendMessage(from, {
            text: `✅ Added ${added.length} user(s) to blacklist!\nThey will be kicked if they send a message.`,
            mentions: added
        }, { quoted: msg })
    },

    delBlacklist: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin, getMentions } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        const mentions = getMentions(msg)
        if (!mentions.length) return sock.sendMessage(from, {
            text: '❌ Tag the person to remove from blacklist!'
        }, { quoted: msg })

        if (!blacklists[from]?.length) return sock.sendMessage(from, { text: '❌ Blacklist is empty!' }, { quoted: msg })

        const mentionNums = mentions.map(normalizeJid)
        blacklists[from] = blacklists[from].filter(jid => !mentionNums.includes(normalizeJid(jid)))
        db.save('blacklists', blacklists)

        await sock.sendMessage(from, {
            text: `✅ Removed ${mentions.length} user(s) from blacklist!`,
            mentions
        }, { quoted: msg })
    },

    listBlacklist: async ({ sock, from, msg, isGroup }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const bl = blacklists[from] || []
        if (!bl.length) return sock.sendMessage(from, { text: '📋 Blacklist is empty!' }, { quoted: msg })

        const { phonesOf } = require('../utils/jids')
        const pns = await phonesOf(sock, bl, from)
        const list = pns.map((jid, i) => `${i + 1}. @${jid.split('@')[0]}`).join('\n')
        await sock.sendMessage(from, {
            text: `🚫 *Blacklisted Users (${bl.length}):*\n\n${list}`,
            mentions: pns
        }, { quoted: msg })
    },

    resetBlacklist: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        blacklists[from] = []
        db.save('blacklists', blacklists)
        await sock.sendMessage(from, { text: '✅ Blacklist has been reset!' }, { quoted: msg })
    },

    blacklists
}