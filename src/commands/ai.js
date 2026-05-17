const Groq = require('groq-sdk')
const config = require('../config')

const MAX_HISTORY = Number(config.aiMaxHistory) || 20
const SESSION_TTL_MS = (Number(config.aiSessionTtlMinutes) || 30) * 60_000
const MAX_REPLY_CHARS = 3_500
const sessions = new Map()

let groq = null

function getGroqClient() {
    if (!config.groqApiKey) return null
    if (!groq) groq = new Groq({ apiKey: config.groqApiKey })
    return groq
}

function getSessionKey({ from, sender }) {
    return `${from}:${sender}`
}

function getSession(key) {
    const now = Date.now()
    let session = sessions.get(key)
    if (!session || now - session.lastUsed > SESSION_TTL_MS) {
        session = { history: [], lastUsed: now }
        sessions.set(key, session)
    }
    return session
}

function trimHistory(history) {
    return history.slice(-MAX_HISTORY)
}

function splitReply(text) {
    if (text.length <= MAX_REPLY_CHARS) return [text]

    const chunks = []
    let remaining = text

    while (remaining.length > MAX_REPLY_CHARS) {
        const slice = remaining.slice(0, MAX_REPLY_CHARS)
        const splitAt = Math.max(
            slice.lastIndexOf('\n\n'),
            slice.lastIndexOf('\n'),
            slice.lastIndexOf('. '),
            slice.lastIndexOf(' ')
        )
        const end = splitAt > 500 ? splitAt + 1 : MAX_REPLY_CHARS
        chunks.push(remaining.slice(0, end).trim())
        remaining = remaining.slice(end).trim()
    }

    if (remaining) chunks.push(remaining)
    return chunks
}

setInterval(() => {
    const cutoff = Date.now() - SESSION_TTL_MS
    for (const [key, value] of sessions) {
        if (value.lastUsed < cutoff) sessions.delete(key)
    }
}, SESSION_TTL_MS).unref()

module.exports = {
    chat: async ({ sock, from, msg, sender, text }) => {
        if (!text) {
            return sock.sendMessage(from, {
                text: '❓ Please provide a question!\nExample: *!ai what is the capital of France?*'
            }, { quoted: msg })
        }

        const client = getGroqClient()
        if (!client) {
            return sock.sendMessage(from, {
                text: '❌ AI is not configured (missing GROQ_API_KEY).'
            }, { quoted: msg })
        }

        const sessionKey = getSessionKey({ from, sender })
        const session = getSession(sessionKey)

        try {
            await sock.sendMessage(from, { text: '🤖 Thinking...' }, { quoted: msg })

            session.history.push({ role: 'user', content: text })
            session.history = trimHistory(session.history)
            session.lastUsed = Date.now()

            const response = await client.chat.completions.create({
                model: config.aiModel,
                messages: [
                    { role: 'system', content: config.aiSystemPrompt },
                    ...session.history
                ],
                max_tokens: Number(config.aiMaxTokens) || 1024
            })

            const reply = response.choices?.[0]?.message?.content?.trim()
            if (!reply) throw new Error('AI response did not include message content')

            session.history.push({ role: 'assistant', content: reply })
            session.history = trimHistory(session.history)
            session.lastUsed = Date.now()

            for (const chunk of splitReply(reply)) {
                await sock.sendMessage(from, { text: chunk }, { quoted: msg })
            }
        } catch (err) {
            session.history = session.history.filter(item => !(item.role === 'user' && item.content === text))
            console.error('[AI ERROR]', err)
            await sock.sendMessage(from, {
                text: '❌ AI error. Please try again later!'
            }, { quoted: msg })
        }
    },

    reset: async ({ sock, from, msg, sender }) => {
        sessions.delete(getSessionKey({ from, sender }))
        await sock.sendMessage(from, {
            text: '✅ Your AI chat context has been reset.'
        }, { quoted: msg })
    }
}
