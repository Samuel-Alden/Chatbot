const idBadwords = require('indonesian-badwords')
const axios = require('axios')

const DICT_URL = 'https://raw.githubusercontent.com/drizki/indonesian-badwords/main/src/dict.json'
const REFRESH_INTERVAL_MS = 24 * 60 * 60_000

async function refreshDict() {
    try {
        const { data } = await axios.get(DICT_URL, {
            timeout: 10_000,
            // Don't surface a stale cached copy of the file.
            headers: { 'Cache-Control': 'no-cache' }
        })
        if (!Array.isArray(data)) {
            console.warn('[badwords] unexpected dict format, skipping refresh')
            return
        }
        const before = idBadwords.dict.length
        const words = data.filter(w => typeof w === 'string' && w)
        idBadwords.addWords(words)
        const added = idBadwords.dict.length - before
        if (added > 0) {
            console.log(`[badwords] refreshed from GitHub: +${added} words (total ${idBadwords.dict.length})`)
        }
    } catch (err) {
        console.warn('[badwords] refresh failed:', err.message)
    }
}

// Initial fetch on module load, then refresh every 24h.
// Errors fall through silently — the bundled dict stays in use as a fallback.
refreshDict()
setInterval(refreshDict, REFRESH_INTERVAL_MS).unref()

// The library does plain substring matching, which false-positives on short
// dictionary entries (e.g. `asu` inside `asuransi`, `masuk`, `kasur`). We do
// our own detection: word-boundary matching for everything, plus concat-style
// substring matching ONLY for dictionary words at least MIN_CONCAT_LENGTH long
// (where a coincidental match is genuinely unlikely).
const MIN_CONCAT_LENGTH = 6

const LEETSPEAK_MAP = {
    '4': 'a', '@': 'a',
    '8': 'b',
    '(': 'c',
    '3': 'e',
    '6': 'g', '9': 'g',
    '1': 'i', '!': 'i', '|': 'i',
    '0': 'o',
    '5': 's', '$': 's',
    '7': 't',
    '2': 'z'
}

function normalize(text) {
    return String(text || '')
        .toLowerCase()
        .split('')
        .map(c => LEETSPEAK_MAP[c] || c)
        .join('')
}

function findBadWords(body, customList) {
    if (!body) return []

    const found = new Set()
    const dict = idBadwords.dict || []
    const dictSet = new Set(dict.map(w => String(w).toLowerCase()))
    const normalized = normalize(body)

    // 1) Word-boundary detection. Split on anything that isn't a letter or
    //    digit (Unicode-aware), then check each token against the dictionary.
    //    Handles leetspeak too: '4nj1ng' normalises to 'anjing'.
    const tokens = normalized.split(/[^\p{L}\p{N}]+/u)
    for (const token of tokens) {
        if (token && dictSet.has(token)) found.add(token)
    }

    // 2) Concat detection for long dictionary entries only. Catches
    //    'dasarbajingankontol' → ['bajingan', 'kontol']. Short entries like
    //    'asu' are skipped here to avoid the false positives we had before.
    for (const word of dict) {
        const lower = String(word).toLowerCase()
        if (lower.length < MIN_CONCAT_LENGTH) continue
        if (normalized.includes(lower)) found.add(lower)
    }

    // 3) Per-group custom list (plain lowercased substring match).
    if (customList?.length) {
        const lower = body.toLowerCase()
        for (const word of customList) {
            const w = String(word || '').toLowerCase()
            if (w && lower.includes(w)) found.add(w)
        }
    }

    return [...found]
}

module.exports = { findBadWords, refreshDict }
