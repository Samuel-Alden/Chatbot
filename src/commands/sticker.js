const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const path = require('path')
const { loadBaileys } = require('../utils/baileys')
const { firstExistingFile, fontCandidates, resolveFfmpegPath } = require('../utils/systemBinaries')

const ffmpegPath = resolveFfmpegPath()
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)

const MAX_CAPTION_CHARS = 100
const CHARS_PER_LINE = 14

// Find a font file ffmpeg's drawtext filter can use. First hit wins.
const CAPTION_FONT = firstExistingFile(fontCandidates())

function wrapCaption(text) {
    const words = text.trim().split(/\s+/).filter(Boolean)
    const lines = []
    let current = ''
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word
        if (candidate.length > CHARS_PER_LINE && current) {
            lines.push(current)
            current = word
        } else {
            current = candidate
        }
    }
    if (current) lines.push(current)
    return lines.join('\n')
}

module.exports = {
    makeSticker: async ({ sock, from, msg, text }) => {
        if (!ffmpegPath) {
            await sock.sendMessage(from, {
                text: '❌ `ffmpeg` is not installed or not on PATH. Install it before using sticker commands.'
            }, { quoted: msg })
            return
        }

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

        const caption = (text || '').trim()
        if (caption.length > MAX_CAPTION_CHARS) {
            await sock.sendMessage(from, {
                text: `❌ Caption too long. Keep it under ${MAX_CAPTION_CHARS} characters.`
            }, { quoted: msg })
            return
        }

        await sock.sendMessage(from, { text: '⏳ Creating sticker...' }, { quoted: msg })

        const tmpDir = path.join(__dirname, '../../tmp')
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

        const stamp = Date.now()
        const inputPath = path.join(tmpDir, `input_${stamp}.${isImage ? 'jpg' : 'mp4'}`)
        const outputPath = path.join(tmpDir, `sticker_${stamp}.webp`)
        const captionPath = path.join(tmpDir, `caption_${stamp}.txt`)
        let captionFileWritten = false

        try {
            const { downloadMediaMessage } = await loadBaileys()
            const buffer = await downloadMediaMessage(
                { message: targetMsg.message, key: targetMsg.key },
                'buffer',
                {},
                { logger: { info: () => {}, warn: () => {}, error: () => {} }, reuploadRequest: sock.updateMediaMessage }
            )

            fs.writeFileSync(inputPath, buffer)

            // Force a true 512x512 frame so the caption is drawn on a square
            // canvas and doesn't get squashed when WhatsApp displays the
            // sticker. The picture/video itself stretches to fit.
            const scale = isVideo ? 'scale=512:512,fps=15' : 'scale=512:512'

            let vf = scale
            if (caption) {
                fs.writeFileSync(captionPath, wrapCaption(caption))
                captionFileWritten = true
                const fontPart = CAPTION_FONT ? `fontfile=${CAPTION_FONT}:` : ''
                // White text with a thick black border so it reads on any background.
                vf += `,drawtext=${fontPart}textfile=${captionPath}:fontsize=72:fontcolor=white:bordercolor=black:borderw=5:line_spacing=8:x=(w-text_w)/2:y=h-text_h-18`
            }

            await new Promise((resolve, reject) => {
                ffmpeg(inputPath).outputOptions([
                    '-vf', vf,
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
            const cleanup = [inputPath, outputPath]
            if (captionFileWritten) cleanup.push(captionPath)
            for (const p of cleanup) {
                if (fs.existsSync(p)) fs.unlinkSync(p)
            }
        }
    }
}
