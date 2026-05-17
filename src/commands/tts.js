const axios = require('axios')
const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const path = require('path')
const { resolveFfmpegPath } = require('../utils/systemBinaries')

const ffmpegPath = resolveFfmpegPath()
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)

const ENDPOINT = 'https://translate.google.com/translate_tts'

module.exports = {
    tts: async ({ sock, from, msg, args }) => {
        if (!ffmpegPath) {
            await sock.sendMessage(from, {
                text: '❌ `ffmpeg` is not installed or not on PATH. Install it before using TTS.'
            }, { quoted: msg })
            return
        }

        const usage = `❌ *Usage:* \`!tts <lang> <text>\`\n\n*Examples:*\n• \`!tts en Hello world\`\n• \`!tts id Apa kabar\`\n• \`!tts ja\` (replying to a message)\n\nCommon codes: en, id, ja, ko, zh, fr, de, es, ru, ar`

        if (!args[0]) {
            await sock.sendMessage(from, { text: usage }, { quoted: msg })
            return
        }

        const lang = args[0].toLowerCase()
        let text = args.slice(1).join(' ')

        if (!text) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
            text = quoted?.conversation
                || quoted?.extendedTextMessage?.text
                || quoted?.imageMessage?.caption
                || quoted?.videoMessage?.caption
                || ''
        }

        if (!text) {
            await sock.sendMessage(from, { text: usage }, { quoted: msg })
            return
        }

        if (text.length > 200) {
            await sock.sendMessage(from, {
                text: '❌ Text is too long. Keep it under 200 characters.'
            }, { quoted: msg })
            return
        }

        const tmpDir = path.join(__dirname, '../../tmp')
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

        const stamp = Date.now()
        const mp3Path = path.join(tmpDir, `tts_${stamp}.mp3`)
        const oggPath = path.join(tmpDir, `tts_${stamp}.ogg`)

        try {
            const { data } = await axios.get(ENDPOINT, {
                params: { ie: 'UTF-8', q: text, tl: lang, client: 'tw-ob' },
                responseType: 'arraybuffer',
                timeout: 15_000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            })

            fs.writeFileSync(mp3Path, Buffer.from(data))

            await new Promise((resolve, reject) => {
                ffmpeg(mp3Path)
                    .outputOptions(['-c:a', 'libopus', '-b:a', '64k', '-vbr', 'on'])
                    .output(oggPath)
                    .on('end', resolve)
                    .on('error', reject)
                    .run()
            })

            const buffer = fs.readFileSync(oggPath)
            await sock.sendMessage(from, {
                audio: buffer,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            }, { quoted: msg })
        } catch (err) {
            console.error('[TTS ERROR]', err.message)
            await sock.sendMessage(from, {
                text: '❌ TTS failed. Check the language code (e.g. en, id, ja) and try again.'
            }, { quoted: msg })
        } finally {
            for (const p of [mp3Path, oggPath]) {
                if (fs.existsSync(p)) fs.unlinkSync(p)
            }
        }
    }
}
