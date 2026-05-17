const Parser = require('rss-parser')

const parser = new Parser({
    timeout: 6_000,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RiwooBot/1.0)' }
})

// Curated feeds per category. Mix of Indonesian + international sources.
// Add or remove URLs here to tune what each category returns.
const FEEDS = {
    general: [
        'http://feeds.bbci.co.uk/news/rss.xml',
        'https://news.detik.com/rss',
        'https://www.antaranews.com/rss/terkini'
    ],
    economy: [
        'http://feeds.bbci.co.uk/news/business/rss.xml',
        'https://www.cnbcindonesia.com/rss',
        'https://www.antaranews.com/rss/ekonomi.xml'
    ],
    politics: [
        'http://feeds.bbci.co.uk/news/politics/rss.xml',
        'https://www.antaranews.com/rss/politik.xml',
        'https://rss.tempo.co/nasional'
    ],
    tech: [
        'https://www.theverge.com/rss/index.xml',
        'https://techcrunch.com/feed/'
    ],
    sports: [
        'http://feeds.bbci.co.uk/sport/rss.xml'
    ],
    entertainment: [
        'https://variety.com/feed/'
    ],
    music: [
        'https://pitchfork.com/rss/news/'
    ],
    kpop: [
        'https://www.soompi.com/feed',
        'https://www.koreaboo.com/feed/'
    ],
    world: [
        'http://feeds.bbci.co.uk/news/world/rss.xml',
        'https://www.aljazeera.com/xml/rss/all.xml'
    ],
    science: [
        'https://www.sciencedaily.com/rss/all.xml'
    ],
    health: [
        'http://feeds.bbci.co.uk/news/health/rss.xml'
    ]
}

const ALIASES = {
    business: 'economy', biz: 'economy', ekonomi: 'economy',
    political: 'politics', pol: 'politics', politik: 'politics',
    technology: 'tech', teknologi: 'tech',
    sport: 'sports', olahraga: 'sports',
    entertain: 'entertainment', hiburan: 'entertainment',
    musik: 'music',
    'k-pop': 'kpop',
    international: 'world', internasional: 'world', dunia: 'world',
    kesehatan: 'health',
    sains: 'science'
}

const CACHE_TTL_MS = 10 * 60_000
const cache = new Map()

const ITEMS_PER_REPLY = 6
const MAX_ITEMS_PER_FEED = 8

async function fetchCategory(category) {
    const cached = cache.get(category)
    if (cached && cached.expiresAt > Date.now()) return cached.items

    const feeds = FEEDS[category]
    const results = await Promise.allSettled(
        feeds.map(url => parser.parseURL(url))
    )

    const items = []
    for (const result of results) {
        const feed = result.status === 'fulfilled' ? result.value : null
        if (!feed?.items) continue
        for (const item of feed.items.slice(0, MAX_ITEMS_PER_FEED)) {
            const title = String(item.title || '').trim()
            if (!title) continue
            items.push({
                title,
                link: item.link || '',
                source: feed.title || urlHost(item.link) || 'news',
                pubDate: item.isoDate || item.pubDate || null
            })
        }
    }

    // Dedupe by lowercased title
    const seen = new Set()
    const deduped = items.filter(it => {
        const key = it.title.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })

    deduped.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
    const top = deduped.slice(0, ITEMS_PER_REPLY)

    cache.set(category, { items: top, expiresAt: Date.now() + CACHE_TTL_MS })
    return top
}

function urlHost(url) {
    try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function timeAgo(isoString) {
    if (!isoString) return ''
    const ms = Date.now() - new Date(isoString).getTime()
    if (!Number.isFinite(ms) || ms < 0) return ''
    const sec = Math.floor(ms / 1000)
    if (sec < 60) return `${sec}s ago`
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}m ago`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}h ago`
    return `${Math.floor(hr / 24)}d ago`
}

function resolveCategory(input) {
    const lower = String(input || 'general').toLowerCase().trim()
    if (FEEDS[lower]) return lower
    if (ALIASES[lower]) return ALIASES[lower]
    return null
}

module.exports = {
    dailynews: async ({ sock, from, msg, args }) => {
        const requested = args[0] || 'general'
        const category = resolveCategory(requested)

        if (!category) {
            const available = [...new Set([...Object.keys(FEEDS), ...Object.keys(ALIASES)])].sort()
            await sock.sendMessage(from, {
                text: `❌ Unknown category: *${requested}*\n\n*Available:* ${available.map(c => `\`${c}\``).join(', ')}\n\n*Example:* \`!dailynews kpop\``
            }, { quoted: msg })
            return
        }

        await sock.sendMessage(from, { text: `📰 Fetching ${category} news...` }, { quoted: msg })

        try {
            const items = await fetchCategory(category)
            if (!items.length) {
                await sock.sendMessage(from, {
                    text: `📰 No ${category} news available right now. Try again in a few minutes.`
                }, { quoted: msg })
                return
            }

            const lines = items.map((item, i) => {
                const when = item.pubDate ? ` · ${timeAgo(item.pubDate)}` : ''
                return `*${i + 1}.* ${item.title}\n_${item.source}_${when}\n${item.link}`
            })

            await sock.sendMessage(from, {
                text: `📰 *Daily News — ${category}*\n\n${lines.join('\n\n')}`
            }, { quoted: msg })
        } catch (err) {
            console.error('[DAILYNEWS ERROR]', err.message)
            await sock.sendMessage(from, {
                text: '❌ Failed to fetch news. Try again later.'
            }, { quoted: msg })
        }
    }
}
