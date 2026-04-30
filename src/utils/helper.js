function normalizeJid(jid) {
    return jid?.replace(/:[0-9]+@.*/, '').replace(/@.*/, '')
}

async function isAdmin(sock, groupId, userId) {
    const cleanId = normalizeJid(userId)
    const metadata = await sock.groupMetadata(groupId)

    return metadata.participants.some(p => {
        if (!p.admin) return false
        return normalizeJid(p.id) === cleanId
    })
}

async function isBotAdmin(sock, groupId) {
    const botNum = normalizeJid(sock.user.id)
    const botLid = normalizeJid(sock.user.lid || '')

    const metadata = await sock.groupMetadata(groupId)

    return metadata.participants.some(p => {
        if (!p.admin) return false
        const pId = normalizeJid(p.id)
        return pId === botNum || (botLid && pId === botLid)
    })
}

function toJID(number) {
    return number.replace(/[^0-9]/g, '') + '@s.whatsapp.net'
}

function getMentions(msg) {
    return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
}

function getQuoted(msg) {
    return msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || null
}

module.exports = { isAdmin, isBotAdmin, toJID, getMentions, getQuoted, normalizeJid }