const express = require('express')
const basicAuth = require('basic-auth')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { exec } = require('child_process')

const db = require('../utils/db')

const ENV_PATH = path.join(__dirname, '../../.env')
const GROUP_SETTINGS_PATH = path.join(__dirname, '../../data/groupSettings.json')

// Keys we let the dashboard edit. Everything else stays in .env but is invisible
// to the UI to reduce blast radius (don't want a UI typo killing OWNER_NUMBER).
const EDITABLE_ENV_KEYS = [
    'BOT_NAME',
    'BOT_PREFIX',
    'OWNER_NUMBER',
    'LOG_LEVEL',
    'GROQ_API_KEY',
    'AI_MODEL',
    'AI_MAX_TOKENS',
    'AI_MAX_HISTORY',
    'AI_SESSION_TTL_MINUTES',
    'AI_SYSTEM_PROMPT'
]

// Toggle settings the UI can flip per group.
const GROUP_BOOL_KEYS = ['antiLink', 'antiBadWord', 'antiBot', 'antiDelete', 'welcome']
const GROUP_TEXT_KEYS = ['welcomeMessage', 'leftMessage']

let sockRef = null
let connectionState = 'unknown'

function setSock(sock) {
    sockRef = sock
}

function setConnectionState(state) {
    connectionState = state
}

function parseEnvFile(text) {
    const out = {}
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) continue
        const idx = line.indexOf('=')
        if (idx === -1) continue
        const key = line.slice(0, idx).trim()
        let value = line.slice(idx + 1).trim()
        // Strip wrapping quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1)
        }
        out[key] = value
    }
    return out
}

function serializeEnv(currentText, updates) {
    const lines = currentText.split(/\r?\n/)
    const seen = new Set()
    const newLines = lines.map(line => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) return line
        const idx = trimmed.indexOf('=')
        if (idx === -1) return line
        const key = trimmed.slice(0, idx).trim()
        if (!(key in updates)) return line
        seen.add(key)
        return `${key}=${quoteIfNeeded(updates[key])}`
    })
    for (const key of Object.keys(updates)) {
        if (seen.has(key)) continue
        newLines.push(`${key}=${quoteIfNeeded(updates[key])}`)
    }
    return newLines.join('\n')
}

function quoteIfNeeded(value) {
    const str = String(value ?? '')
    if (/[#"\s]/.test(str)) return JSON.stringify(str)
    return str
}

async function tailLog(filePath, lines = 200) {
    if (!fs.existsSync(filePath)) return ''
    // Read tail efficiently by reading from the end.
    const stat = fs.statSync(filePath)
    const sliceSize = Math.min(stat.size, 64 * 1024 * Math.ceil(lines / 100))
    const start = Math.max(0, stat.size - sliceSize)
    const fd = fs.openSync(filePath, 'r')
    try {
        const buf = Buffer.alloc(stat.size - start)
        fs.readSync(fd, buf, 0, buf.length, start)
        const text = buf.toString('utf8')
        const all = text.split('\n')
        return all.slice(-lines).join('\n')
    } finally {
        fs.closeSync(fd)
    }
}

function pm2LogPath(stream) {
    // Default PM2 log location on Linux/Termux. Could be customized — if so the
    // user can set DASHBOARD_LOG_OUT / DASHBOARD_LOG_ERR env vars.
    const envOverride = stream === 'out' ? process.env.DASHBOARD_LOG_OUT : process.env.DASHBOARD_LOG_ERR
    if (envOverride && fs.existsSync(envOverride)) return envOverride
    const home = process.env.HOME || os.homedir()
    const candidates = [
        path.join(home, '.pm2/logs/whatsapp-bot-' + stream + '.log'),
        path.join(home, '.pm2/logs/bot-' + stream + '.log')
    ]
    return candidates.find(p => fs.existsSync(p)) || candidates[0]
}

function pm2Jlist() {
    return new Promise(resolve => {
        exec('pm2 jlist', { timeout: 4000 }, (err, stdout) => {
            if (err) return resolve(null)
            try { resolve(JSON.parse(stdout)) } catch { resolve(null) }
        })
    })
}

async function getStatus() {
    const pm2Procs = await pm2Jlist()
    const me = pm2Procs?.find(p =>
        ['whatsapp-bot', 'bot'].includes(p.name)
    ) || null

    return {
        connection: connectionState,
        uptimeSeconds: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid,
        pm2: me ? {
            name: me.name,
            status: me.pm2_env?.status,
            restarts: me.pm2_env?.restart_time,
            uptimeMs: me.pm2_env?.pm_uptime ? Date.now() - me.pm2_env.pm_uptime : null,
            cpu: me.monit?.cpu,
            memory: me.monit?.memory
        } : null
    }
}

async function getGroupsOverview() {
    let stored = {}
    if (fs.existsSync(GROUP_SETTINGS_PATH)) {
        try { stored = JSON.parse(fs.readFileSync(GROUP_SETTINGS_PATH, 'utf8')) } catch {}
    }

    const ids = Object.keys(stored)
    const results = []
    for (const id of ids) {
        let name = id
        try {
            if (sockRef) {
                const meta = await sockRef.groupMetadata(id)
                name = meta?.subject || id
            }
        } catch {}
        results.push({
            id,
            name,
            settings: stored[id] || {}
        })
    }
    return results.sort((a, b) => a.name.localeCompare(b.name))
}

function basicAuthGuard(req, res, next) {
    const user = basicAuth(req)
    const required = {
        name: process.env.DASHBOARD_USER,
        pass: process.env.DASHBOARD_PASS
    }
    if (!required.name || !required.pass) {
        res.status(500).type('text/plain')
            .send('Dashboard auth not configured. Set DASHBOARD_USER and DASHBOARD_PASS in .env.')
        return
    }
    if (!user || user.name !== required.name || user.pass !== required.pass) {
        res.set('WWW-Authenticate', 'Basic realm="bot-dashboard"')
        res.status(401).type('text/plain').send('Authentication required')
        return
    }
    next()
}

function buildApp() {
    const app = express()
    app.use(express.json({ limit: '256kb' }))
    app.use(basicAuthGuard)
    app.use(express.static(path.join(__dirname, 'public')))

    app.get('/api/status', async (req, res) => {
        res.json(await getStatus())
    })

    app.get('/api/logs', async (req, res) => {
        const lines = Math.max(50, Math.min(2000, Number(req.query.lines) || 300))
        const [out, err] = await Promise.all([
            tailLog(pm2LogPath('out'), lines),
            tailLog(pm2LogPath('error'), Math.floor(lines / 2))
        ])
        res.json({ out, err })
    })

    app.get('/api/env', (req, res) => {
        const text = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : ''
        const parsed = parseEnvFile(text)
        const view = {}
        for (const key of EDITABLE_ENV_KEYS) view[key] = parsed[key] || ''
        res.json(view)
    })

    app.post('/api/env', (req, res) => {
        const updates = {}
        for (const key of EDITABLE_ENV_KEYS) {
            if (key in (req.body || {})) updates[key] = String(req.body[key] ?? '')
        }
        const current = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : ''
        const next = serializeEnv(current, updates)
        fs.writeFileSync(ENV_PATH, next)
        res.json({ ok: true, updated: Object.keys(updates) })
    })

    app.get('/api/groups', async (req, res) => {
        res.json(await getGroupsOverview())
    })

    app.post('/api/groups/:id', (req, res) => {
        const { id } = req.params
        const body = req.body || {}
        let stored = {}
        if (fs.existsSync(GROUP_SETTINGS_PATH)) {
            try { stored = JSON.parse(fs.readFileSync(GROUP_SETTINGS_PATH, 'utf8')) } catch {}
        }
        if (!stored[id]) stored[id] = {}

        for (const key of GROUP_BOOL_KEYS) {
            if (key in body) stored[id][key] = Boolean(body[key])
        }
        for (const key of GROUP_TEXT_KEYS) {
            if (key in body) stored[id][key] = String(body[key] ?? '')
        }
        if (Array.isArray(body.badWords)) {
            stored[id].badWords = body.badWords
                .map(w => String(w || '').trim().toLowerCase())
                .filter(Boolean)
        }

        // Persist via the same atomic-write helper the bot uses.
        db.save('groupSettings', stored)
        res.json({ ok: true, settings: stored[id] })
    })

    app.post('/api/restart', (req, res) => {
        res.json({ ok: true, message: 'Restart requested. Reconnect in a few seconds.' })
        // Let the response flush, then ask PM2 to restart us.
        setTimeout(() => {
            exec('pm2 restart whatsapp-bot || pm2 restart bot', () => {})
        }, 250)
    })

    app.get('/api/health', (req, res) => res.json({ ok: true }))

    return app
}

function start({ port = Number(process.env.DASHBOARD_PORT) || 3000 } = {}) {
    if (!process.env.DASHBOARD_USER || !process.env.DASHBOARD_PASS) {
        console.warn('[dashboard] DASHBOARD_USER / DASHBOARD_PASS not set in .env — dashboard NOT started.')
        return null
    }
    const app = buildApp()
    const server = app.listen(port, '0.0.0.0', () => {
        console.log(`[dashboard] listening on http://0.0.0.0:${port} (basic auth required)`)
    })
    return server
}

module.exports = { start, setSock, setConnectionState }
