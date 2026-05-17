const fs = require('fs')
const path = require('path')

const cache = new Map()

function isExecutable(filePath) {
    if (!filePath) return false
    try {
        fs.accessSync(filePath, fs.constants.X_OK)
        return true
    } catch {
        return false
    }
}

function normalizeCandidate(filePath) {
    if (!filePath) return null
    const trimmed = String(filePath).trim()
    return trimmed || null
}

function findOnPath(name) {
    const target = normalizeCandidate(name)
    if (!target) return null

    if (path.isAbsolute(target) && isExecutable(target)) return target

    const pathEnv = process.env.PATH || ''
    const parts = pathEnv.split(path.delimiter).filter(Boolean)
    const extensions = process.platform === 'win32'
        ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
        : ['']

    for (const dir of parts) {
        for (const ext of extensions) {
            const fullPath = path.join(dir, process.platform === 'win32' ? `${target}${ext}` : target)
            if (isExecutable(fullPath)) return fullPath
        }
    }

    return null
}

function resolveBinary(cacheKey, { envVars = [], names = [], fallback } = {}) {
    if (cache.has(cacheKey)) return cache.get(cacheKey)

    const candidates = []
    for (const envVar of envVars) {
        const value = normalizeCandidate(process.env[envVar])
        if (value) candidates.push(value)
    }
    candidates.push(...names.map(normalizeCandidate).filter(Boolean))

    for (const candidate of candidates) {
        const found = findOnPath(candidate)
        if (found) {
            cache.set(cacheKey, found)
            return found
        }
    }

    let resolvedFallback = null
    if (typeof fallback === 'function') {
        try {
            resolvedFallback = normalizeCandidate(fallback())
        } catch {
            resolvedFallback = null
        }
    } else {
        resolvedFallback = normalizeCandidate(fallback)
    }

    if (resolvedFallback && isExecutable(resolvedFallback)) {
        cache.set(cacheKey, resolvedFallback)
        return resolvedFallback
    }

    cache.set(cacheKey, null)
    return null
}

function resolveFfmpegPath() {
    return resolveBinary('ffmpeg', {
        envVars: ['FFMPEG_PATH'],
        names: ['ffmpeg'],
        fallback: () => {
            const installer = require('@ffmpeg-installer/ffmpeg')
            return installer.path
        }
    })
}

function resolveYtDlpPath() {
    return resolveBinary('yt-dlp', {
        envVars: ['YT_DLP_PATH'],
        names: ['yt-dlp']
    })
}

function dedupe(values) {
    return [...new Set(values.filter(Boolean))]
}

function termuxPrefix() {
    return normalizeCandidate(process.env.PREFIX) || '/data/data/com.termux/files/usr'
}

function fontCandidates() {
    const prefix = termuxPrefix()
    return dedupe([
        path.join(prefix, 'share/fonts/TTF/DejaVuSans-Bold.ttf'),
        path.join(prefix, 'share/fonts/TTF/DejaVuSans.ttf'),
        path.join(prefix, 'share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
        path.join(prefix, 'share/fonts/truetype/dejavu/DejaVuSans.ttf'),
        path.join(prefix, 'share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'),
        path.join(prefix, 'share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'),
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
    ])
}

function firstExistingFile(paths) {
    for (const candidate of paths) {
        if (candidate && fs.existsSync(candidate)) return candidate
    }
    return null
}

module.exports = {
    firstExistingFile,
    fontCandidates,
    resolveFfmpegPath,
    resolveYtDlpPath,
    termuxPrefix
}
