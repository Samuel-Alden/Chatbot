const cron = require('node-cron')
const db = require('../utils/db')

const groupTimezones = db.load('timezones')
const alarms = db.load('alarms')

let sockRef = null

const TIMEZONE_MAP = {
    'wib': 'Asia/Jakarta',
    'wita': 'Asia/Makassar',
    'wit': 'Asia/Jayapura',
    'wst': 'Asia/Kuala_Lumpur',
    'sgt': 'Asia/Singapore',
    'pht': 'Asia/Manila',
    'ict': 'Asia/Bangkok',
    'ist': 'Asia/Kolkata',
    'jst': 'Asia/Tokyo',
    'cst': 'Asia/Shanghai',
    'aest': 'Australia/Sydney',
    'gmt': 'Etc/GMT',
    'utc': 'UTC',
    'est': 'America/New_York',
    'pst': 'America/Los_Angeles'
}

function getTimezone(groupId) {
    return groupTimezones[groupId] || 'Asia/Jakarta'
}

function parseTime(timeStr) {
    const [hour, minute] = timeStr.split(':').map(Number)
    if (isNaN(hour) || isNaN(minute) || hour > 23 || minute > 59) return null
    return { hour, minute }
}

function restoreAlarms(sock) {
    sockRef = sock
    for (const groupId of Object.keys(alarms)) {
        for (const [name, alarm] of Object.entries(alarms[groupId])) {
            // Stop existing job if any
            alarms[groupId][name].job?.stop()
            
            if (!alarm.enabled) continue
            const [hour, minute] = alarm.time.split(':').map(Number)
            const job = cron.schedule(`${minute} ${hour} * * *`, async () => {
                if (!alarms[groupId]?.[name]?.enabled) return
                await sockRef.sendMessage(groupId, {
                    text: `⏰ *ALARM: ${name.toUpperCase()}*\n\n${alarm.message}`
                })
            }, { timezone: getTimezone(groupId) })
            alarms[groupId][name].job = job
        }
    }
    console.log('[ALARM] Restored alarms from disk.')
}

function setSock(sock) {
    sockRef = sock
    restoreAlarms(sock)
}

module.exports = {
    setSock,
    getTimezone,

    setTimezone: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (!text) {
            const list = Object.keys(TIMEZONE_MAP).map(k => `*${k.toUpperCase()}* — ${TIMEZONE_MAP[k]}`).join('\n')
            return sock.sendMessage(from, {
                text: `🌍 *Available Timezones:*\n\n${list}\n\nUsage: *!settimezone WIB*`
            }, { quoted: msg })
        }

        const tz = text.trim().toLowerCase()
        if (!TIMEZONE_MAP[tz]) {
            return sock.sendMessage(from, {
                text: `❌ Unknown timezone! Type *!settimezone* to see available options.`
            }, { quoted: msg })
        }

        groupTimezones[from] = TIMEZONE_MAP[tz]
        db.save('timezones', groupTimezones)
        await sock.sendMessage(from, {
            text: `✅ Group timezone set to *${text.toUpperCase()}* (${TIMEZONE_MAP[tz]})!\nAll new alarms will use this timezone.`
        }, { quoted: msg })
    },

    addAlarm: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (!text) return sock.sendMessage(from, {
            text: '❌ Usage: *!addalarm name | HH:MM | message*\nExample: *!addalarm morning | 07:00 | Good morning everyone! ☀️*'
        }, { quoted: msg })

        const parts = text.split('|').map(p => p.trim())
        if (parts.length < 3) return sock.sendMessage(from, {
            text: '❌ Please use correct format!\nExample: *!addalarm morning | 07:00 | Good morning everyone! ☀️*'
        }, { quoted: msg })

        const [name, timeStr, ...msgParts] = parts
        const alarmMsg = msgParts.join('|').trim()
        const time = parseTime(timeStr)

        if (!time) return sock.sendMessage(from, {
            text: '❌ Invalid time format! Please use HH:MM (e.g. 07:00, 14:30)'
        }, { quoted: msg })

        if (!alarms[from]) alarms[from] = {}
        if (alarms[from][name]) return sock.sendMessage(from, {
            text: `❌ Alarm *${name}* already exists! Delete it first with *!delalarm ${name}*`
        }, { quoted: msg })

        const tz = getTimezone(from)
        const job = cron.schedule(`${time.minute} ${time.hour} * * *`, async () => {
            if (!alarms[from]?.[name]?.enabled) return
            await sockRef.sendMessage(from, {
                text: `⏰ *ALARM: ${name.toUpperCase()}*\n\n${alarmMsg}`
            })
        }, { timezone: tz })

        alarms[from][name] = {
            name,
            time: timeStr,
            message: alarmMsg,
            enabled: true,
            job
        }
        db.save('alarms', alarms)

        const tzLabel = Object.keys(TIMEZONE_MAP).find(k => TIMEZONE_MAP[k] === tz)?.toUpperCase() || tz
        await sock.sendMessage(from, {
            text: `✅ Alarm *${name}* set for *${timeStr}* (${tzLabel}) every day!\nMessage: ${alarmMsg}`
        }, { quoted: msg })
    },

    delAlarm: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (!text) return sock.sendMessage(from, { text: '❌ Please provide alarm name!\nExample: *!delalarm morning*' }, { quoted: msg })

        const name = text.trim().toLowerCase()
        if (!alarms[from]?.[name]) return sock.sendMessage(from, {
            text: `❌ Alarm *${name}* not found!`
        }, { quoted: msg })

        alarms[from][name].job?.stop()
        delete alarms[from][name]
        db.save('alarms', alarms)

        await sock.sendMessage(from, { text: `✅ Alarm *${name}* has been deleted!` }, { quoted: msg })
    },

    listAlarm: async ({ sock, from, msg, isGroup }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const groupAlarms = alarms[from] || {}
        const entries = Object.values(groupAlarms)

        if (!entries.length) return sock.sendMessage(from, { text: '⏰ No alarms set for this group!' }, { quoted: msg })

        const tz = getTimezone(from)
        const tzLabel = Object.keys(TIMEZONE_MAP).find(k => TIMEZONE_MAP[k] === tz)?.toUpperCase() || tz

        const list = entries.map((a, i) =>
            `${i + 1}. *${a.name}* — ${a.time} ${tzLabel} ${a.enabled ? '✅' : '❌'}\n    📝 ${a.message}`
        ).join('\n\n')

        await sock.sendMessage(from, {
            text: `⏰ *ALARM LIST*\n\n${list}`
        }, { quoted: msg })
    },

    enableAlarm: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (!text) return sock.sendMessage(from, { text: '❌ Please provide alarm name!\nExample: *!enablealarm morning*' }, { quoted: msg })

        const name = text.trim().toLowerCase()
        if (!alarms[from]?.[name]) return sock.sendMessage(from, { text: `❌ Alarm *${name}* not found!` }, { quoted: msg })

        alarms[from][name].enabled = true
        db.save('alarms', alarms)
        await sock.sendMessage(from, { text: `✅ Alarm *${name}* has been enabled!` }, { quoted: msg })
    },

    disableAlarm: async ({ sock, from, msg, isGroup, sender, text }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        if (!text) return sock.sendMessage(from, { text: '❌ Please provide alarm name!\nExample: *!disablealarm morning*' }, { quoted: msg })

        const name = text.trim().toLowerCase()
        if (!alarms[from]?.[name]) return sock.sendMessage(from, { text: `❌ Alarm *${name}* not found!` }, { quoted: msg })

        alarms[from][name].enabled = false
        db.save('alarms', alarms)
        await sock.sendMessage(from, { text: `⏸️ Alarm *${name}* has been disabled!` }, { quoted: msg })
    },

    resetAlarm: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        const { isAdmin } = require('../utils/helper')
        if (!await isAdmin(sock, from, sender)) return sock.sendMessage(from, { text: '❌ You must be an admin!' }, { quoted: msg })

        const groupAlarms = alarms[from] || {}
        Object.values(groupAlarms).forEach(a => a.job?.stop())
        alarms[from] = {}
        db.save('alarms', alarms)

        await sock.sendMessage(from, { text: '✅ All alarms have been reset!' }, { quoted: msg })
    }
}