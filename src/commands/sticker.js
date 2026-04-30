const { downloadMediaMessage } = require('baileys')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path
const fs = require('fs')
const path = require('path')

ffmpeg.setFfmpegPath(ffmpegPath)

module.exports = {
    makeSticker: async ({ sock, from, msg }) => {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        const targetMsg = quoted
            ? { message: quoted, key: msg.key }
            : msg

        const msgType = Object.keys(targetMsg.message || {})[0]
        const isImage = msgType === 'imageMessage'
        const isVideo = msgType === 'videoMessage' || msgType === 'gifMessage'

        if (!isImage && !isVideo) {
            await sock.sendMessage(from, {
                text: '❌ Please send or reply to an *image* or *video* to make a sticker!'
            }, { quoted: msg })
            return
        }

        await sock.sendMessage(from, { text: '⏳ Creating sticker...' }, { quoted: msg })

        const tmpDir = path.join(__dirname, '../../tmp')
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

        const inputPath = path.join(tmpDir, `input_${Date.now()}.${isImage ? 'jpg' : 'mp4'}`)
        const outputPath = path.join(tmpDir, `sticker_${Date.now()}.webp`)

        try {
            const buffer = await downloadMediaMessage(
                { message: targetMsg.message, key: targetMsg.key },
                'buffer',
                {},
                { logger: { info: () => {}, warn: () => {}, error: () => {} }, reuploadRequest: sock.updateMediaMessage }
            )

            fs.writeFileSync(inputPath, buffer)

            await new Promise((resolve, reject) => {
                ffmpeg(inputPath).outputOptions([
                    '-vf', isVideo
                        ? 'scale=512:512:force_original_aspect_ratio=decrease,fps=15'
                        : 'scale=512:512:force_original_aspect_ratio=decrease',
                    '-loop', '0',
                    '-preset', 'default',
                    '-an',
                    '-vsync', '0',
                    '-t', '8'
                ])
                .output(outputPath)
                .on('end', resolve)
                .on('error', reject)
                .run()
            })

            const webpBuffer = fs.readFileSync(outputPath)
            await sock.sendMessage(from, { sticker: webpBuffer }, { quoted: msg })

        } catch (err) {
            console.error('[STICKER ERROR]', err)
            await sock.sendMessage(from, {
                text: '❌ Failed to create sticker. Make sure you replied to an image or video!'
            }, { quoted: msg })
        } finally {
            for (const p of [inputPath, outputPath]) {
                if (fs.existsSync(p)) fs.unlinkSync(p)
            }
        }
    }
}