const db = require('../utils/db')
const { normalizeJid } = require('../utils/helper')
const { phoneOf, phonesOf } = require('../utils/jids')

const sessions = db.load('absen')

module.exports = {
    mulaiAbsen: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (sessions[from]?.active) return sock.sendMessage(from, {
            text: '❌ There is already an active attendance session! Use *!deleteabsen* to end it first.'
        }, { quoted: msg })

        const topic = text || 'General Attendance'
        sessions[from] = {
            active: true,
            topic,
            date: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }),
            startTime: Date.now(),
            attendees: []
        }
        db.save('absen', sessions)

        await sock.sendMessage(from, {
            text: `📋 *ATTENDANCE STARTED!*\n\n📌 Topic: *${topic}*\n📅 Date: ${sessions[from].date}\n\nType *!absen* to mark your attendance!`
        }, { quoted: msg })
    },

    absen: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!sessions[from]?.active) return sock.sendMessage(from, {
            text: '❌ No active attendance session! Ask an admin to start one with *!mulaiabsen*'
        }, { quoted: msg })

        const session = sessions[from]
        const senderNum = normalizeJid(sender)
        const alreadyAttended = session.attendees.find(a => normalizeJid(a.jid) === senderNum)

        const pn = await phoneOf(sock, sender, from)
        if (alreadyAttended) return sock.sendMessage(from, {
            text: `❌ @${pn.split('@')[0]}, you have already marked your attendance!`,
            mentions: [pn]
        }, { quoted: msg })

        const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
        session.attendees.push({ jid: sender, time })
        db.save('absen', sessions)

        await sock.sendMessage(from, {
            text: `✅ @${pn.split('@')[0]} has marked attendance!\n⏰ Time: ${time}\n👥 Total: ${session.attendees.length}`,
            mentions: [pn]
        }, { quoted: msg })
    },

    cekAbsen: async ({ sock, from, msg, isGroup }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!sessions[from]) return sock.sendMessage(from, { text: '❌ No attendance session found!' }, { quoted: msg })

        const session = sessions[from]
        if (!session.attendees.length) return sock.sendMessage(from, {
            text: '📋 No one has marked attendance yet!'
        }, { quoted: msg })

        const pns = await phonesOf(sock, session.attendees.map(a => a.jid), from)
        const list = session.attendees.map((a, i) =>
            `${i + 1}. @${pns[i].split('@')[0]} — ${a.time}`
        ).join('\n')

        await sock.sendMessage(from, {
            text: `📋 *ATTENDANCE LIST*\n📌 Topic: ${session.topic}\n📅 Date: ${session.date}\n👥 Total: ${session.attendees.length}\n\n${list}`,
            mentions: pns
        }, { quoted: msg })
    },

    deleteAbsen: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })
        if (!sessions[from]) return sock.sendMessage(from, { text: '❌ No attendance session found!' }, { quoted: msg })

        const count = sessions[from].attendees.length
        delete sessions[from]
        db.save('absen', sessions)

        await sock.sendMessage(from, {
            text: `✅ Attendance session ended!\n👥 Total who attended: ${count}`
        }, { quoted: msg })
    }
}