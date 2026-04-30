require('dotenv').config()

module.exports = {
    botName: process.env.BOT_NAME || 'Riwoo',
    prefix: process.env.PREFIX || '!',
    ownerNumber: process.env.OWNER_NUMBER,
    groqApiKey: process.env.GROQ_API_KEY
}
