const cron = require('node-cron')
const db = require('../utils/db')
const { getTimezone } = require('./alarm')

const reminders = db.load('reminders')
let sockRef = null

function parseDateTime(dateTimeStr) {
    const [datePart, timePart] = dateTimeStr.split(' ')
    if (!datePart || !timePart) return null
    const [day, month, year] = datePart.split('/').map(Number)
    const [hour, minute] = timePart.split(':').map(Number)
    if ([day, month, year, hour, minute].some(isNaN)) return null
    if (month > 12 || day > 31 || hour > 23 || minute > 59) return null
    return { day, month, year, hour, minute }
}

function restoreReminders(sock) {
    sockRef = sock
    for (const groupId of Object.keys(reminders)) {
        for (const [name, reminder] of Object.entries(reminders[groupId])) {
            // Stop existing job if any
            reminders[groupId][name].job?.stop()

            const dt = parseDateTime(reminder.datetime)
            if (!dt) continue
            const job = cron.schedule(
                `${dt.minute} ${dt.hour} ${dt.day} ${dt.month} *`,
                async () => {
                    await sockRef.sendMessage(groupId, {
                        text: `🔔 *REMINDER: ${name.toUpperCase()}*\n\n${reminder.message}`
                    })
                    if (reminders[groupId]?.[name]) {
                        reminders[groupId][name].job?.stop()
                        delete reminders[groupId][name]
                        db.save('reminders', reminders)
                    }
                },
                { timezone: getTimezone(groupId) }
            )
            reminders[groupId][name].job = job
        }
    }
    console.log('[REMINDER] Restored reminders from disk.')
}

function setSock(sock) {
    sockRef = sock
    restoreReminders(sock)
}

module.exports = {
    setSock,

    addReminder: async ({ sock, from, msg, isGroup, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        if (!text) return sock.sendMessage(from, {
            text: '❌ Usage: *!addreminder name | DD/MM/YYYY HH:MM | message*\nExample: *!addreminder meeting | 25/12/2025 09:00 | Meeting starts now!*'
        }, { quoted: msg })

        const parts = text.split('|').map(p => p.trim())
        if (parts.length < 3) return sock.sendMessage(from, {
            text: '❌ Please use correct format!\nExample: *!addreminder meeting | 25/12/2025 09:00 | Meeting starts now!*'
        }, { quoted: msg })

        const [name, dateTimeStr, ...msgParts] = parts
        const reminderMsg = msgParts.join('|').trim()
        const dt = parseDateTime(dateTimeStr)

        if (!dt) return sock.sendMessage(from, {
            text: '❌ Invalid date/time format! Please use DD/MM/YYYY HH:MM'
        }, { quoted: msg })

        if (!reminders[from]) reminders[from] = {}
        if (reminders[from][name]) return sock.sendMessage(from, {
            text: `❌ Reminder *${name}* already exists!`
        }, { quoted: msg })

        const job = cron.schedule(
            `${dt.minute} ${dt.hour} ${dt.day} ${dt.month} *`,
            async () => {
                await sockRef.sendMessage(from, {
                    text: `🔔 *REMINDER: ${name.toUpperCase()}*\n\n${reminderMsg}`
                })
                if (reminders[from]?.[name]) {
                    reminders[from][name].job?.stop()
                    delete reminders[from][name]
                    db.save('reminders', reminders)
                }
            },
            { timezone: getTimezone(from) }
        )

        reminders[from][name] = { name, datetime: dateTimeStr, message: reminderMsg, job }
        db.save('reminders', reminders)

        await sock.sendMessage(from, {
            text: `✅ Reminder *${name}* set for *${dateTimeStr}*!\nMessage: ${reminderMsg}`
        }, { quoted: msg })
    },

    delReminder: async ({ sock, from, msg, isGroup, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!text) return sock.sendMessage(from, { text: '❌ Please provide reminder name!' }, { quoted: msg })

        const name = text.trim().toLowerCase()
        if (!reminders[from]?.[name]) return sock.sendMessage(from, {
            text: `❌ Reminder *${name}* not found!`
        }, { quoted: msg })

        reminders[from][name].job?.stop()
        delete reminders[from][name]
        db.save('reminders', reminders)

        await sock.sendMessage(from, { text: `✅ Reminder *${name}* deleted!` }, { quoted: msg })
    },

    listReminder: async ({ sock, from, msg, isGroup }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const groupReminders = reminders[from] || {}
        const entries = Object.values(groupReminders)

        if (!entries.length) return sock.sendMessage(from, { text: '🔔 No reminders set!' }, { quoted: msg })

        const list = entries.map((r, i) =>
            `${i + 1}. *${r.name}* — ${r.datetime}\n    📝 ${r.message}`
        ).join('\n\n')

        await sock.sendMessage(from, { text: `🔔 *REMINDER LIST*\n\n${list}` }, { quoted: msg })
    },

    resetReminder: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        const groupReminders = reminders[from] || {}
        Object.values(groupReminders).forEach(r => r.job?.stop())
        reminders[from] = {}
        db.save('reminders', reminders)

        await sock.sendMessage(from, { text: '✅ All reminders reset!' }, { quoted: msg })
    }
}