const { createWorker } = require('tesseract.js')
const { loadBaileys } = require('../utils/baileys')

const SILENT_LOGGER = {
    info: () => {}, warn: () => {}, error: () => {},
    debug: () => {}, trace: () => {}, fatal: () => {},
    child: () => SILENT_LOGGER, level: 'silent'
}

const DEFAULT_LANG = 'eng'
const MAX_REPLY_CHARS = 3_500
const workers = new Map()

async function getWorker(langs) {
    let entry = workers.get(langs)
    if (entry) return entry

    // Serialize concurrent creates for the same language so we don't load it twice.
    const promise = createWorker(langs)
    workers.set(langs, promise)
    try {
        const worker = await promise
        workers.set(langs, worker)
        return worker
    } catch (err) {
        workers.delete(langs)
        throw err
    }
}

module.exports = {
    ocr: async ({ sock, from, msg, args }) => {
        const usage = `❌ Reply to or send an *image* with \`!ocr\` to read its text.\n\n*Examples:*\n• \`!ocr\` (default English)\n• \`!ocr ind\` (Indonesian)\n• \`!ocr eng+ind\` (multi-language)\n\nLanguage codes are 3 letters: eng, ind, jpn, kor, chi_sim, fra, spa, deu, ara, rus, tha, vie.`

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        const targetMsg = quoted ? { message: quoted, key: msg.key } : msg
        const msgType = Object.keys(targetMsg.message || {})[0]
        const isImage = msgType === 'imageMessage'

        if (!isImage) {
            await sock.sendMessage(from, { text: usage }, { quoted: msg })
            return
        }

        const langs = (args[0] || DEFAULT_LANG).toLowerCase()
        if (!/^[a-z]+(_[a-z]+)?(\+[a-z]+(_[a-z]+)?)*$/.test(langs)) {
            await sock.sendMessage(from, {
                text: '❌ Invalid language code. Use 3-letter codes joined by `+`. Example: `eng`, `ind`, `eng+ind`, `chi_sim`.'
            }, { quoted: msg })
            return
        }

        await sock.sendMessage(from, { text: '🔍 Reading text...' }, { quoted: msg })

        try {
            const { downloadMediaMessage } = await loadBaileys()
            const buffer = await downloadMediaMessage(
                { message: targetMsg.message, key: targetMsg.key },
                'buffer',
                {},
                { logger: SILENT_LOGGER, reuploadRequest: sock.updateMediaMessage }
            )

            const worker = await getWorker(langs)
            const { data: { text } } = await worker.recognize(buffer)
            const cleaned = String(text || '').trim()

            if (!cleaned) {
                await sock.sendMessage(from, {
                    text: '🔍 No readable text found in the image.'
                }, { quoted: msg })
                return
            }

            const preview = cleaned.length > MAX_REPLY_CHARS
                ? cleaned.slice(0, MAX_REPLY_CHARS) + '\n\n_(truncated)_'
                : cleaned

            await sock.sendMessage(from, {
                text: `🔍 *OCR (${langs})*\n\n${preview}`
            }, { quoted: msg })
        } catch (err) {
            console.error('[OCR ERROR]', err)
            await sock.sendMessage(from, {
                text: '❌ OCR failed. Make sure you replied to a clear image. If this is the first time using this language, downloading the model can take a minute.'
            }, { quoted: msg })
        }
    }
}
