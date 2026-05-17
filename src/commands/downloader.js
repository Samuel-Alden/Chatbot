const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const util = require('util')
const { resolveFfmpegPath, resolveYtDlpPath } = require('../utils/systemBinaries')
const execFilePromise = util.promisify(execFile)

const tmpDir = path.join(__dirname, '../../tmp')
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

// Allowlist URLs to block injection of stray flags or shell metacharacters.
// yt-dlp also accepts `--` as an end-of-options sentinel, which we use below.
function isSafeUrl(url) {
    if (typeof url !== 'string') return false
    if (url.length > 2048) return false
    try {
        const u = new URL(url.trim())
        return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
        return false
    }
}

async function downloadYoutube(url, type) {
    const ytDlpPath = resolveYtDlpPath()
    const ffmpegPath = resolveFfmpegPath()
    if (!ytDlpPath) throw new Error('yt-dlp not found on PATH')
    if (!ffmpegPath) throw new Error('ffmpeg not found on PATH')

    const outputPath = path.join(tmpDir, `yt_${Date.now()}`)
    const baseArgs = [
        '--ffmpeg-location', ffmpegPath,
        '-o', `${outputPath}.%(ext)s`
    ]

    if (type === 'mp3') {
        await execFilePromise(ytDlpPath, [
            '-x', '--audio-format', 'mp3', '--audio-quality', '0',
            ...baseArgs, '--', url
        ])
        return `${outputPath}.mp3`
    }

    await execFilePromise(ytDlpPath, [
        '-f', 'best[ext=mp4][filesize<50M]/best[ext=mp4]/best',
        ...baseArgs, '--', url
    ])
    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(path.basename(outputPath)))
    if (!files.length) throw new Error('Downloaded file not found')
    return path.join(tmpDir, files[0])
}

module.exports = {
    youtube: async ({ sock, from, msg, text, command }) => {
        if (!text) {
            await sock.sendMessage(from, {
                text: `❌ Please provide a YouTube URL!\nExample: *!${command} https://youtube.com/watch?v=xxx*`
            }, { quoted: msg })
            return
        }
        if (!isSafeUrl(text)) {
            await sock.sendMessage(from, { text: '❌ Invalid URL!' }, { quoted: msg })
            return
        }

        const type = command === 'ytmp3' ? 'mp3' : 'mp4'
        if (!resolveYtDlpPath()) {
            await sock.sendMessage(from, {
                text: '❌ `yt-dlp` is not installed or not on PATH. Install it before using downloader commands.'
            }, { quoted: msg })
            return
        }
        if (!resolveFfmpegPath()) {
            await sock.sendMessage(from, {
                text: '❌ `ffmpeg` is not installed or not on PATH. Install it before using downloader commands.'
            }, { quoted: msg })
            return
        }
        await sock.sendMessage(from, { text: `⏳ Downloading YouTube ${type.toUpperCase()}, please wait...` }, { quoted: msg })

        let filePath = null
        try {
            filePath = await downloadYoutube(text.trim(), type)
            const fileBuffer = fs.readFileSync(filePath)

            if (type === 'mp3') {
                await sock.sendMessage(from, {
                    audio: fileBuffer,
                    mimetype: 'audio/mpeg',
                    ptt: false
                }, { quoted: msg })
            } else {
                await sock.sendMessage(from, {
                    video: fileBuffer,
                    mimetype: 'video/mp4',
                    caption: '✅ Here is your video!'
                }, { quoted: msg })
            }

        } catch (err) {
            console.error('[YT ERROR]', err)
            await sock.sendMessage(from, {
                text: '❌ Failed to download. The video might be age-restricted, private, or too large (>50MB).'
            }, { quoted: msg })
        } finally {
            if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
        }
    },

    tiktok: async ({ sock, from, msg, text }) => {
        if (!text) {
            await sock.sendMessage(from, {
                text: '❌ Please provide a TikTok URL!\nExample: *!tiktok https://tiktok.com/@user/video/xxx*'
            }, { quoted: msg })
            return
        }
        if (!isSafeUrl(text)) {
            await sock.sendMessage(from, { text: '❌ Invalid URL!' }, { quoted: msg })
            return
        }

        if (!resolveYtDlpPath()) {
            await sock.sendMessage(from, {
                text: '❌ `yt-dlp` is not installed or not on PATH. Install it before using downloader commands.'
            }, { quoted: msg })
            return
        }
        if (!resolveFfmpegPath()) {
            await sock.sendMessage(from, {
                text: '❌ `ffmpeg` is not installed or not on PATH. Install it before using downloader commands.'
            }, { quoted: msg })
            return
        }
        await sock.sendMessage(from, { text: '⏳ Downloading TikTok video, please wait...' }, { quoted: msg })

        let filePath = null
        try {
            const ytDlpPath = resolveYtDlpPath()
            const ffmpegPath = resolveFfmpegPath()
            const outputPath = path.join(tmpDir, `tt_${Date.now()}`)
            await execFilePromise(ytDlpPath, [
                '-f', 'best[ext=mp4]/best',
                '--ffmpeg-location', ffmpegPath,
                '-o', `${outputPath}.%(ext)s`,
                '--', text.trim()
            ])

            const files = fs.readdirSync(tmpDir).filter(f => f.startsWith(path.basename(outputPath)))
            if (!files.length) throw new Error('Downloaded file not found')

            filePath = path.join(tmpDir, files[0])
            const fileBuffer = fs.readFileSync(filePath)

            await sock.sendMessage(from, {
                video: fileBuffer,
                mimetype: 'video/mp4',
                caption: '✅ Here is your TikTok video!'
            }, { quoted: msg })

        } catch (err) {
            console.error('[TIKTOK ERROR]', err)
            await sock.sendMessage(from, {
                text: '❌ Failed to download TikTok video. Make sure the URL is valid and the video is public!'
            }, { quoted: msg })
        } finally {
            if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
        }
    }
}
