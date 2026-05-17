const axios = require('axios')
const FormData = require('form-data')
const { loadBaileys } = require('../utils/baileys')

const QR_ENDPOINT = 'https://api.qrserver.com/v1/create-qr-code/'
const CATBOX_ENDPOINT = 'https://catbox.moe/user/api.php'

async function uploadToCatbox(buffer, filename) {
    const form = new FormData()
    form.append('reqtype', 'fileupload')
    form.append('fileToUpload', buffer, { filename })

    const { data } = await axios.post(CATBOX_ENDPOINT, form, {
        headers: form.getHeaders(),
        timeout: 60_000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
    })

    const url = String(data).trim()
    if (!/^https?:\/\//i.test(url)) {
        throw new Error(`Catbox returned unexpected response: ${url}`)
    }
    return url
}

const SILENT_LOGGER = {
    info: () => {}, warn: () => {}, error: () => {},
    debug: () => {}, trace: () => {}, fatal: () => {},
    child: () => SILENT_LOGGER, level: 'silent'
}

module.exports = {
    qrcode: async ({ sock, from, msg, text }) => {
        const usage = `❌ *Usage:*\n• \`!qrcode <text or url>\`\n• Reply to an *image* or *video* with \`!qrcode\` to make a QR linking to it\n\n*Examples:*\n• \`!qrcode https://github.com\`\n• \`!qrcode WIFI:T:WPA;S:MyWifi;P:mypass;;\`\n• Reply to an image with \`!qrcode\``

        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        const targetMsg = quoted ? { message: quoted, key: msg.key } : msg
        const msgType = Object.keys(targetMsg.message || {})[0]
        const isMedia = msgType === 'imageMessage' || msgType === 'videoMessage'

        let qrData = text

        if (isMedia) {
            await sock.sendMessage(from, { text: '⏳ Uploading media...' }, { quoted: msg })
            try {
                const { downloadMediaMessage } = await loadBaileys()
                const buffer = await downloadMediaMessage(
                    { message: targetMsg.message, key: targetMsg.key },
                    'buffer',
                    {},
                    { logger: SILENT_LOGGER, reuploadRequest: sock.updateMediaMessage }
                )
                const ext = msgType === 'imageMessage' ? 'jpg' : 'mp4'
                qrData = await uploadToCatbox(buffer, `qr_${Date.now()}.${ext}`)
            } catch (err) {
                console.error('[QRCODE UPLOAD ERROR]', err.message)
                await sock.sendMessage(from, {
                    text: '❌ Failed to upload media. Try again.'
                }, { quoted: msg })
                return
            }
        }

        if (!qrData) {
            await sock.sendMessage(from, { text: usage }, { quoted: msg })
            return
        }

        if (qrData.length > 900) {
            await sock.sendMessage(from, {
                text: '❌ Text is too long. Keep it under 900 characters.'
            }, { quoted: msg })
            return
        }

        try {
            const { data } = await axios.get(QR_ENDPOINT, {
                params: { size: '500x500', data: qrData, margin: 10 },
                responseType: 'arraybuffer',
                timeout: 10_000
            })

            await sock.sendMessage(from, {
                image: Buffer.from(data),
                caption: `🔗 *QR Code*\n\n${qrData}`
            }, { quoted: msg })
        } catch (err) {
            console.error('[QRCODE ERROR]', err.message)
            await sock.sendMessage(from, {
                text: '❌ Failed to generate QR code. Try again.'
            }, { quoted: msg })
        }
    }
}
