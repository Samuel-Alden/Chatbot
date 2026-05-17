const axios = require('axios')

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single'

module.exports = {
    translate: async ({ sock, from, msg, args }) => {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        const quotedText = quoted?.conversation
            || quoted?.extendedTextMessage?.text
            || quoted?.imageMessage?.caption
            || quoted?.videoMessage?.caption
            || ''

        const target = (args[0] || '').toLowerCase()
        const rest = args.slice(1).join(' ')
        const text = rest || quotedText

        if (!target || !text) {
            await sock.sendMessage(from, {
                text: `❌ *Usage:*\n• \`!translate <lang> <text>\`\n• Reply to a message with \`!translate <lang>\`\n\n*Examples:*\n• \`!translate id Hello world\`\n• \`!translate ja Good morning\`\n• \`!translate en\` (replying to a message)\n\nCommon codes: en, id, ja, ko, zh, fr, de, es, ar, ru, th, vi`
            }, { quoted: msg })
            return
        }

        try {
            const { data } = await axios.get(ENDPOINT, {
                params: {
                    client: 'gtx',
                    sl: 'auto',
                    tl: target,
                    dt: 't',
                    q: text
                },
                timeout: 10_000
            })

            const segments = Array.isArray(data?.[0]) ? data[0] : []
            const translated = segments.map(s => s?.[0]).filter(Boolean).join('')
            const sourceLang = data?.[2] || 'auto'

            if (!translated) {
                await sock.sendMessage(from, {
                    text: '❌ Got an empty translation back. Check the language code.'
                }, { quoted: msg })
                return
            }

            await sock.sendMessage(from, {
                text: `🌐 *Translate* ( _${sourceLang}_ → _${target}_ )\n\n${translated}`
            }, { quoted: msg })
        } catch (err) {
            console.error('[TRANSLATE ERROR]', err.message)
            await sock.sendMessage(from, {
                text: '❌ Translation failed. Make sure the target language code is valid (e.g. en, id, ja, ko, fr).'
            }, { quoted: msg })
        }
    }
}
