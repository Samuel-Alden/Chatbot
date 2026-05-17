// In modern WhatsApp, group participants often appear as `<14-digit>@lid`
// (linked-identity JID) instead of `<phone>@s.whatsapp.net`. When that LID
// is displayed via .split('@')[0], users see a random 14-digit number
// instead of their real phone, and mentions don't link correctly.
//
// phoneOf() resolves an `@lid` JID to its phone-number JID. Other JIDs
// (already PN, or non-WhatsApp identifiers) pass through unchanged.

async function phoneOf(sock, jid, groupId) {
    if (!jid || typeof jid !== 'string') return jid
    if (!jid.endsWith('@lid')) return jid

    // 1) In-memory mapping kept by baileys' signal repository (instant).
    try {
        const pn = await sock?.signalRepository?.lidMapping?.getPNForLID?.(jid)
        if (pn) return pn
    } catch {}

    // 2) Fall back to group metadata (cached by baileys).
    if (groupId) {
        try {
            const metadata = await sock.groupMetadata(groupId)
            const participant = metadata?.participants?.find(p => p.id === jid)
            if (participant?.phoneNumber) return participant.phoneNumber
        } catch {}
    }

    return jid
}

async function phonesOf(sock, jids, groupId) {
    return Promise.all((jids || []).map(j => phoneOf(sock, j, groupId)))
}

module.exports = { phoneOf, phonesOf }
