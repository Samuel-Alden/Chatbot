const fs = require('fs')
const path = require('path')

const DB_PATH = path.join(__dirname, '../../data')
if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH, { recursive: true })

function getFilePath(name) {
    return path.join(DB_PATH, `${name}.json`)
}

function load(name) {
    const file = getFilePath(name)
    if (!fs.existsSync(file)) return {}
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
        // Back up the corrupt file so we don't silently lose user data
        const backup = `${file}.corrupt-${Date.now()}`
        try { fs.renameSync(file, backup) } catch {}
        console.error(`[DB] ${name}.json was corrupt; moved to ${path.basename(backup)}`)
        return {}
    }
}

function save(name, data) {
    const file = getFilePath(name)
    const tmp = `${file}.tmp`
    try {
        // Strip non-serializable things like cron jobs before saving
        const clean = JSON.parse(JSON.stringify(data, (key, value) => {
            if (key === 'job') return undefined
            return value
        }))
        // Atomic write so a crash mid-save can't leave a half-written file
        fs.writeFileSync(tmp, JSON.stringify(clean, null, 2))
        fs.renameSync(tmp, file)
    } catch (err) {
        console.error(`[DB] Failed to save ${name}:`, err)
    }
}

module.exports = { load, save }
