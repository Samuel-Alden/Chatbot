const db = require('../utils/db')
const { normalizeJid } = require('../utils/helper')

const msgCount = db.load('msgcount')

module.exports = {
    increment: (groupId, jid) => {
        if (!msgCount[groupId]) msgCount[groupId] = {}
        const num = normalizeJid(jid)
        if (!msgCount[groupId][num]) msgCount[groupId][num] = 0
        msgCount[groupId][num]++
        db.save('msgcount', msgCount)
    },

    totalPesan: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const senderNum = normalizeJid(sender)
        const count = msgCount[from]?.[senderNum] || 0
        await sock.sendMessage(from, {
            text: `📊 @${sender.split('@')[0]} has sent *${count} messages* in this group!`,
            mentions: [sender]
        }, { quoted: msg })
    },

    listTotalPesan: async ({ sock, from, msg, isGroup }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const counts = msgCount[from] || {}
        const entries = Object.entries(counts).sort((a, b) => b[1] - a[1])

        if (!entries.length) return sock.sendMessage(from, { text: '📊 No message data yet!' }, { quoted: msg })

        const top = entries.slice(0, 10)
        const list = top.map(([num, count], i) =>
            `${i + 1}. @${num} — *${count} messages*`
        ).join('\n')
        const mentions = top.map(([num]) => num + '@s.whatsapp.net')

        await sock.sendMessage(from, {
            text: `📊 *TOP MESSAGE SENDERS*\n\n${list}`,
            mentions
        }, { quoted: msg })
    },

    deleteTotalPesan: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin, getMentions } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        const mentions = getMentions(msg)
        if (!mentions.length) return sock.sendMessage(from, {
            text: '❌ Tag the user to delete their count!\nExample: *!deletetotalpesan @user*'
        }, { quoted: msg })

        for (const jid of mentions) {
            const num = normalizeJid(jid)
            if (msgCount[from]) delete msgCount[from][num]
        }
        db.save('msgcount', msgCount)

        await sock.sendMessage(from, {
            text: `✅ Deleted message count for ${mentions.length} user(s)!`,
            mentions
        }, { quoted: msg })
    },

    resetTotalPesan: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        msgCount[from] = {}
        db.save('msgcount', msgCount)
        await sock.sendMessage(from, { text: '✅ Message counter has been reset!' }, { quoted: msg })
    }
}