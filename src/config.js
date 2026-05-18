require('dotenv').config({ quiet: true })

module.exports = {
    botName: process.env.BOT_NAME || 'Riwoo',
    // Use BOT_PREFIX, not PREFIX — Termux pre-sets PREFIX to its install dir
    // and dotenv won't override pre-existing env vars.
    prefix: process.env.BOT_PREFIX || '!',
    ownerNumber: process.env.OWNER_NUMBER,
    groqApiKey: process.env.GROQ_API_KEY,
    aiModel: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
    aiMaxTokens: process.env.AI_MAX_TOKENS || '1024',
    aiMaxHistory: process.env.AI_MAX_HISTORY || '20',
    aiSessionTtlMinutes: process.env.AI_SESSION_TTL_MINUTES || '30',
    aiSystemPrompt: process.env.AI_SYSTEM_PROMPT ||
        'You are a helpful WhatsApp bot assistant. Keep responses concise and friendly. Use simple formatting since this is WhatsApp.'
}
