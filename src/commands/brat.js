const ffmpeg = require('fluent-ffmpeg')
const fs = require('fs')
const path = require('path')
const { fontCandidates, resolveFfmpegPath } = require('../utils/systemBinaries')

let createCanvas = null
let GlobalFonts = null
let canvasLoadError = null

try {
    const canvas = require('@napi-rs/canvas')
    createCanvas = canvas.createCanvas
    GlobalFonts = canvas.GlobalFonts
} catch (err) {
    canvasLoadError = err
}

const ffmpegPath = resolveFfmpegPath()
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)

// Register fallback fonts so non-Latin scripts (Hangul, Kanji, etc.) don't render as tofu.
// Files must be on the system (e.g. apt: fonts-noto-cjk). If absent, we skip silently.
if (GlobalFonts) {
    for (const fontPath of fontCandidates()) {
        if (fs.existsSync(fontPath)) {
            try { GlobalFonts.registerFromPath(fontPath, 'NotoCJK') } catch {}
        }
    }
}

const CANVAS_SIZE = 1080
const BG_COLOR = '#ffffff'
const TEXT_COLOR = '#000000'
const FONT_FAMILY = '"Arial Narrow", "Liberation Sans Narrow", Arial, "Liberation Sans", "DejaVu Sans", "NotoCJK", sans-serif'
const PADDING = 80
const MAX_TEXT_LEN = 200

function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean)
    if (!words.length) return ['']

    const lines = []
    let current = ''
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word
        if (ctx.measureText(candidate).width > maxWidth && current) {
            lines.push(current)
            current = word
        } else {
            current = candidate
        }
    }
    if (current) lines.push(current)
    return lines
}

function fitFont(ctx, text, maxWidth, maxHeight) {
    for (let size = 220; size >= 32; size -= 4) {
        ctx.font = `${size}px ${FONT_FAMILY}`
        const lines = wrapText(ctx, text, maxWidth)
        const lineHeight = size * 1.02
        const totalHeight = lines.length * lineHeight
        const tooWide = lines.some(line => ctx.measureText(line).width > maxWidth)
        if (!tooWide && totalHeight <= maxHeight) return { size, lines, lineHeight }
    }
    ctx.font = `32px ${FONT_FAMILY}`
    return { size: 32, lines: wrapText(ctx, text, maxWidth), lineHeight: 32 * 1.02 }
}

module.exports = {
    brat: async ({ sock, from, msg, text }) => {
        if (!createCanvas || !GlobalFonts) {
            console.error('[BRAT ERROR] canvas unavailable:', canvasLoadError?.message || 'unknown error')
            await sock.sendMessage(from, {
                text: '❌ `@napi-rs/canvas` is unavailable on this device right now, so brat cannot run.'
            }, { quoted: msg })
            return
        }

        if (!ffmpegPath) {
            await sock.sendMessage(from, {
                text: '❌ `ffmpeg` is not installed or not on PATH. Install it before using brat.'
            }, { quoted: msg })
            return
        }

        let content = (text || '').trim()
        if (!content) {
            const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
            content = (quoted?.conversation
                || quoted?.extendedTextMessage?.text
                || quoted?.imageMessage?.caption
                || quoted?.videoMessage?.caption
                || '').trim()
        }

        if (!content) {
            await sock.sendMessage(from, {
                text: `❌ *Usage:* \`!brat <text>\` or reply to a message with \`!brat\`\n\n*Example:* \`!brat hello world\``
            }, { quoted: msg })
            return
        }
        if (content.length > MAX_TEXT_LEN) {
            await sock.sendMessage(from, {
                text: `❌ Text is too long. Keep it under ${MAX_TEXT_LEN} characters.`
            }, { quoted: msg })
            return
        }

        const lowered = content.toLowerCase()

        const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE)
        const ctx = canvas.getContext('2d')

        ctx.fillStyle = BG_COLOR
        ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

        ctx.fillStyle = TEXT_COLOR
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'

        const maxWidth = CANVAS_SIZE - PADDING * 2
        const maxHeight = CANVAS_SIZE - PADDING * 2
        const { lines, lineHeight } = fitFont(ctx, lowered, maxWidth, maxHeight)

        const totalHeight = lines.length * lineHeight
        const startY = PADDING + (maxHeight - totalHeight) / 2
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], PADDING, startY + i * lineHeight)
        }

        const pngBuffer = canvas.toBuffer('image/png')

        const tmpDir = path.join(__dirname, '../../tmp')
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
        const stamp = Date.now()
        const pngPath = path.join(tmpDir, `brat_${stamp}.png`)
        const webpPath = path.join(tmpDir, `brat_${stamp}.webp`)

        try {
            fs.writeFileSync(pngPath, pngBuffer)

            await new Promise((resolve, reject) => {
                ffmpeg(pngPath)
                    .outputOptions([
                        '-vcodec', 'libwebp',
                        '-vf', 'gblur=sigma=8,scale=512:512:flags=lanczos',
                        '-q:v', '80',
                        '-preset', 'default',
                        '-loop', '0',
                        '-an',
                        '-vsync', '0'
                    ])
                    .output(webpPath)
                    .on('end', resolve)
                    .on('error', reject)
                    .run()
            })

            const webpBuffer = fs.readFileSync(webpPath)
            await sock.sendMessage(from, { sticker: webpBuffer }, { quoted: msg })
        } catch (err) {
            console.error('[BRAT ERROR]', err)
            await sock.sendMessage(from, {
                text: '❌ Failed to make brat sticker.'
            }, { quoted: msg })
        } finally {
            for (const p of [pngPath, webpPath]) {
                if (fs.existsSync(p)) fs.unlinkSync(p)
            }
        }
    }
}
