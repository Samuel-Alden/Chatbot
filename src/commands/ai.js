const Groq = require('groq-sdk')
const config = require('../config')

const groq = new Groq({ apiKey: config.groqApiKey })

const MAX_HISTORY = 20            // turns kept per user
const SESSION_TTL_MS = 30 * 60_000 // 30 minutes idle → forget context
const sessions = new Map()        // sender → { history, lastUsed }

function getSession(sender) {
    const now = Date.now()
    let s = sessions.get(sender)
    if (!s || now - s.lastUsed > SESSION_TTL_MS) {
        s = { history: [], lastUsed: now }
        sessions.set(sender, s)
    }
    return s
}

// Periodic cleanup so cold users don't pile up forever.
setInterval(() => {
    const cutoff = Date.now() - SESSION_TTL_MS
    for (const [k, v] of sessions) if (v.lastUsed < cutoff) sessions.delete(k)
}, SESSION_TTL_MS).unref()

module.exports = {
    chat: async ({ sock, from, msg, sender, text }) => {
        if (!text) return sock.sendMessage(from, {
            text: '❓ Please provide a question!\nExample: *!ai what is the capital of France?*'
        }, { quoted: msg })

        if (!config.groqApiKey) {
            return sock.sendMessage(from, {
                text: '❌ AI is not configured (missing GROQ_API_KEY).'
            }, { quoted: msg })
        }

        try {
            await sock.sendMessage(from, { text: '🤖 Thinking...' }, { quoted: msg })

            const session = getSession(sender)
            session.history.push({ role: 'user', content: text })
            if (session.history.length > MAX_HISTORY) {
                session.history = session.history.slice(-MAX_HISTORY)
            }

            const response = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'You are a helpful WhatsApp bot assistant. Keep responses concise and friendly. Use simple formatting since this is WhatsApp.' },
                    ...session.history
                ],
                max_tokens: 1024
            })

            const reply = response.choices[0].message.content
            session.history.push({ role: 'assistant', content: reply })
            session.lastUsed = Date.now()

            await sock.sendMessage(from, { text: reply }, { quoted: msg })

        } catch (err) {
            console.error('[AI ERROR]', err)
            await sock.sendMessage(from, {
                text: '❌ AI error. Please try again later!'
            }, { quoted: msg })
        }
    }
}
