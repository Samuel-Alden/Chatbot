const config = require('../config')
const { normalizeJid } = require('../utils/helper')
const downloader = require('../commands/downloader')
const sticker = require('../commands/sticker')
const group = require('../commands/group')
const ai = require('../commands/ai')
const list = require('../commands/list')
const blacklist = require('../commands/blacklist')
const vote = require('../commands/vote')
const absen = require('../commands/absen')
const totalpesan = require('../commands/totalpesan')
const alarm = require('../commands/alarm')
const reminder = require('../commands/reminder')

module.exports = async (sock, msg) => {
    try {
        const from = msg.key.remoteJid
        const isGroup = from.endsWith('@g.us')
        const sender = isGroup ? msg.key.participant : msg.key.remoteJid
        if (!sender) return
        const senderNumber = normalizeJid(sender)
        const isOwner = senderNumber === config.ownerNumber

        // Extract message text
        const body =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            ''

        const isCommand = body.startsWith(config.prefix)
        if (!isCommand) return

        const args = body.slice(config.prefix.length).trim().split(/\s+/)
        const command = args.shift().toLowerCase()
        const text = args.join(' ')

        // Context object passed to every command
        const ctx = {
            sock,
            msg,
            from,
            sender,
            senderNumber,
            isGroup,
            isOwner,
            args,
            text,
            command,
            body
        }

        console.log(`[CMD] ${command} | From: ${senderNumber} | Group: ${isGroup}`)

        // Route to the right command
        switch (command) {
            // --- DOWNLOADER ---
            case 'ytmp3':
            case 'ytmp4':
                await downloader.youtube(ctx)
                break
            case 'tiktok':
            case 'tt':
                await downloader.tiktok(ctx)
                break

            // --- STICKER ---
            case 'sticker':
            case 's':
                await sticker.makeSticker(ctx)
                break

            // --- GROUP TOOLS ---
            case 'kick':
                await group.kick(ctx)
                break
            case 'add':
                await group.add(ctx)
                break
            case 'promote':
                await group.promote(ctx)
                break
            case 'demote':
                await group.demote(ctx)
                break
            case 'mute':
                await group.mute(ctx)
                break
            case 'unmute':
                await group.unmute(ctx)
                break
            case 'tagall':
                await group.tagAll(ctx)
                break
            case 'groupinfo':
                await group.groupInfo(ctx)
                break
            case 'hidetag':
                await group.hideTag(ctx)
                break
            case 'welcome':
                await group.welcome(ctx)
                break
            case 'setwelcome':
                await group.setWelcome(ctx)
                break
            case 'antilink':
                await group.antiLink(ctx)
                break
            case 'warn':
                await group.warn(ctx)
                break
            case 'resetwarn':
                await group.resetWarn(ctx)
                break
            case 'listwarn':
                await group.listWarn(ctx)
                break
            case 'kickme':
                await group.kickMe(ctx)
                break
            case 'linkgc':
                await group.linkGc(ctx)
                break
            case 'revokelink':
                await group.revokeLink(ctx)
                break
            case 'setnamegc':
                await group.setNameGc(ctx)
                break
            case 'setdescgc':
                await group.setDescGc(ctx)
                break
            case 'setopen':
                await group.setOpen(ctx)
                break
            case 'setclose':
                await group.setClose(ctx)
                break
            case 'pinmsg':
                await group.pinMsg(ctx)
                break
            case 'unpinmsg':
                await group.unpinMsg(ctx)
                break
            case 'delete':
                await group.deleteMsg(ctx)
                break
            case 'leavegc':
                await group.leaveGc(ctx)
                break
            case 'groupadmin':
                await group.groupAdmin(ctx)
                break
            case 'antidelete':
                await group.antiDelete(ctx)
                break
            case 'antibadword':
                await group.antiBadWord(ctx)
                break
            case 'addbadword':
                await group.addBadWord(ctx)
                break
            case 'delbadword':
                await group.delBadWord(ctx)
                break
            case 'listbadword':
                await group.listBadWord(ctx)
                break
            case 'resetbadword':
                await group.resetBadWord(ctx)
                break
            case 'afk':
                await group.afk(ctx)
                break
            case 'setleft':
                await group.setLeft(ctx)
                break
            case 'antibot':
                await group.antiBot(ctx)
                break
            case 'descgc':
                await group.descGc(ctx)
                break
            case 'refreshgroup':
                await group.refreshGroup(ctx)
                break

            // LIST
            case 'addlist':
                await list.addList(ctx)
                break
            case 'updatelist':
            case 'uplist':
                await list.updateList(ctx)
                break
            case 'getlist':
            case 'list':
                await list.getList(ctx)
                break
            case 'dellist':
                await list.delList(ctx)
                break
            case 'resetlist':
                await list.resetList(ctx)
                break

            // BLACKLIST
            case 'blacklist':
                await blacklist.addBlacklist(ctx)
                break
            case 'delblacklist':
                await blacklist.delBlacklist(ctx)
                break
            case 'listblacklist':
                await blacklist.listBlacklist(ctx)
                break
            case 'resetblacklist':
                await blacklist.resetBlacklist(ctx)
                break

            // VOTE
            case 'vote':
                await vote.vote(ctx)
                break
            case 'voteresult':
                await vote.voteResult(ctx)
                break
            case 'votestop':
                await vote.voteStop(ctx)
                break

            // ABSEN
            case 'mulaiabsen':
                await absen.mulaiAbsen(ctx)
                break
            case 'absen':
                await absen.absen(ctx)
                break
            case 'cekabsen':
                await absen.cekAbsen(ctx)
                break
            case 'deleteabsen':
                await absen.deleteAbsen(ctx)
                break

            // TOTAL PESAN
            case 'totalpesan':
                await totalpesan.totalPesan(ctx)
                break
            case 'listtotalpesan':
                await totalpesan.listTotalPesan(ctx)
                break
            case 'deletetotalpesan':
                await totalpesan.deleteTotalPesan(ctx)
                break
            case 'resettotalpesan':
                await totalpesan.resetTotalPesan(ctx)
                break

                // ALARM
            case 'addalarm':
                await alarm.addAlarm(ctx)
                break
            case 'delalarm':
                await alarm.delAlarm(ctx)
                break
            case 'listalarm':
                await alarm.listAlarm(ctx)
                break
            case 'enablealarm':
                await alarm.enableAlarm(ctx)
                break
            case 'disablealarm':
                await alarm.disableAlarm(ctx)
                break
            case 'resetalarm':
                await alarm.resetAlarm(ctx)
                break

            // REMINDER
            case 'addreminder':
                await reminder.addReminder(ctx)
                break
            case 'delreminder':
                await reminder.delReminder(ctx)
                break
            case 'listreminder':
                await reminder.listReminder(ctx)
                break
            case 'resetreminder':
                await reminder.resetReminder(ctx)
                break
            case 'settimezone':
                await alarm.setTimezone(ctx)
                break

            // --- AI ---
            case 'ai':
            case 'chat':
                await ai.chat(ctx)
                break

            // --- HELP MENU ---
            case 'menu':
            case 'help':
                await sendMenu(ctx)
                break

            default:
                await sock.sendMessage(from, {
                    text: `❌ Unknown command: *${command}*\nType *${config.prefix}menu* to see all commands.`
                }, { quoted: msg })
        }

    } catch (err) {
        console.error('[ERROR] messageHandler:', err)
    }
}

async function sendMenu({ sock, from, msg }) {
    const { prefix, botName } = require('../config')
    const menu = `
╔══════════════════╗
║   *${botName} Menu*   ║
╚══════════════════╝

📥 *DOWNLOADER*
├ ${prefix}ytmp3 [url] - YouTube to MP3
├ ${prefix}ytmp4 [url] - YouTube to MP4
└ ${prefix}tiktok [url] - TikTok video

🖼️ *STICKER*
└ ${prefix}sticker - Reply an image/video

👥 *GROUP TOOLS*
├ ${prefix}kick @user - Kick a member
├ ${prefix}add [number] - Add a member
├ ${prefix}promote @user - Make admin
├ ${prefix}demote @user - Remove admin
├ ${prefix}mute - Mute the group
├ ${prefix}unmute - Unmute the group
├ ${prefix}tagall - Tag all members
├ ${prefix}hidetag [msg] - Silent tag all
├ ${prefix}groupinfo - Show group info
├ ${prefix}groupadmin - List all admins
├ ${prefix}descgc - Show group description
├ ${prefix}setnamegc [name] - Rename group
├ ${prefix}setdescgc [desc] - Set description
├ ${prefix}setopen - Open group
├ ${prefix}setclose - Close group
├ ${prefix}linkgc - Get invite link
├ ${prefix}revokelink - Revoke invite link
├ ${prefix}pinmsg - Pin a message
├ ${prefix}unpinmsg - Unpin a message
├ ${prefix}delete - Delete a message
├ ${prefix}leavegc - Bot leaves group
├ ${prefix}refreshgroup - Refresh group data
├ ${prefix}kickme - Leave the group yourself
├ ${prefix}welcome on/off - Toggle welcome msg
├ ${prefix}setwelcome [msg] - Set welcome msg
├ ${prefix}setleft [msg] - Set goodbye msg
├ ${prefix}antilink on/off - Toggle anti-link
├ ${prefix}antidelete on/off - Toggle anti-delete
├ ${prefix}antibadword on/off - Toggle anti-badword
├ ${prefix}antibot on/off - Toggle anti-bot
├ ${prefix}addbadword [word] - Add bad word
├ ${prefix}delbadword [word] - Remove bad word
├ ${prefix}listbadword - List bad words
├ ${prefix}resetbadword - Reset bad words
├ ${prefix}warn @user - Warn a member
├ ${prefix}resetwarn @user - Reset warnings
├ ${prefix}listwarn - List warned members
├ ${prefix}afk [reason] - Set AFK status
├ ${prefix}blacklist @user - Blacklist a user
├ ${prefix}delblacklist @user - Remove from blacklist
├ ${prefix}listblacklist - List blacklisted users
├ ${prefix}resetblacklist - Reset blacklist
├ ${prefix}addlist name|content - Add a list
├ ${prefix}updatelist name|content - Update a list
├ ${prefix}getlist [name] - Get a list
├ ${prefix}dellist [name] - Delete a list
├ ${prefix}resetlist - Reset all lists
├ ${prefix}vote question|opt1|opt2 - Start a vote
├ ${prefix}voteresult - See vote results
├ ${prefix}votestop - End the vote
├ ${prefix}mulaiabsen [topic] - Start attendance
├ ${prefix}absen - Mark your attendance
├ ${prefix}cekabsen - Check attendance list
├ ${prefix}deleteabsen - End attendance session
├ ${prefix}totalpesan - Your message count
├ ${prefix}listtotalpesan - Top message senders
├ ${prefix}deletetotalpesan @user - Delete user count
└ ${prefix}resettotalpesan - Reset all counts

🤖 *AI*
└ ${prefix}ai [question] - Ask AI anything

Type a command to get started!
    `.trim()

    await sock.sendMessage(from, { text: menu }, { quoted: msg })
}