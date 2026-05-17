const os = require('os')
const config = require('../config')

function formatUptime(ms) {
    const sec = Math.floor(ms / 1000) % 60
    const min = Math.floor(ms / 60000) % 60
    const hr = Math.floor(ms / 3600000) % 24
    const day = Math.floor(ms / 86400000)
    const parts = []
    if (day) parts.push(`${day}d`)
    if (hr) parts.push(`${hr}h`)
    if (min) parts.push(`${min}m`)
    parts.push(`${sec}s`)
    return parts.join(' ')
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

module.exports = {
    ping: async ({ sock, from, msg }) => {
        const start = Date.now()
        const sent = await sock.sendMessage(from, { text: '🏓 Pong!' }, { quoted: msg })
        const elapsed = Date.now() - start
        const replyText = `🏓 *Pong!*\n⏱️ Speed: *${elapsed}ms*`

        // Edit the same message in-place; fall back to a follow-up if edit isn't supported.
        try {
            await sock.sendMessage(from, { text: replyText, edit: sent.key })
        } catch {
            await sock.sendMessage(from, { text: `⏱️ Speed: *${elapsed}ms*` }, { quoted: msg })
        }
    },

    runtime: async ({ sock, from, msg }) => {
        const uptime = formatUptime(process.uptime() * 1000)
        await sock.sendMessage(from, {
            text: `⏱️ *Bot Runtime*\n${uptime}`
        }, { quoted: msg })
    },

    infobot: async ({ sock, from, msg }) => {
        const mem = process.memoryUsage()
        const totalMem = os.totalmem()
        const freeMem = os.freemem()
        const usedMem = totalMem - freeMem
        const uptime = formatUptime(process.uptime() * 1000)
        const cpu = os.cpus()[0]?.model || 'unknown'
        const cpuCount = os.cpus().length
        const load = os.loadavg().map(n => n.toFixed(2)).join(', ')

        const text = `╭─❒ *Bot Info* ❒
│
│ 🤖 *Name:* ${config.botName}
│ 🔤 *Prefix:* ${config.prefix}
│ 👤 *Owner:* ${config.ownerNumber || '_not set_'}
│ ⏱️ *Uptime:* ${uptime}
│
│ 💾 *Process Memory*
│ ├ rss: ${formatBytes(mem.rss)}
│ ├ heap used: ${formatBytes(mem.heapUsed)}
│ └ heap total: ${formatBytes(mem.heapTotal)}
│
│ 🖥️ *System*
│ ├ node: ${process.version}
│ ├ platform: ${process.platform} (${process.arch})
│ ├ cpu: ${cpu} ×${cpuCount}
│ ├ load: ${load}
│ └ ram: ${formatBytes(usedMem)} / ${formatBytes(totalMem)}
│
╰─────────────────`

        await sock.sendMessage(from, { text }, { quoted: msg })
    }
}
