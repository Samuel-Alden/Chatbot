const downloader = require('../commands/downloader')
const sticker = require('../commands/sticker')
const brat = require('../commands/brat')
const group = require('../commands/group')
const ai = require('../commands/ai')
const list = require('../commands/list')
const blacklist = require('../commands/blacklist')
const vote = require('../commands/vote')
const absen = require('../commands/absen')
const totalpesan = require('../commands/totalpesan')
const alarm = require('../commands/alarm')
const reminder = require('../commands/reminder')
const general = require('../commands/general')
const translate = require('../commands/translate')
const qrcode = require('../commands/qrcode')
const tts = require('../commands/tts')
const ocr = require('../commands/ocr')
const dailynews = require('../commands/dailynews')
const werewolf = require('../commands/werewolf')
const tebaklagukpop = require('../commands/tebaklagukpop')
const tebakanime = require('../commands/tebakanime')
const economy = require('../commands/economy')

const categories = [
    ['DOWNLOADER', [
        command(['ytmp3'], 'ytmp3 [url]', 'YouTube to MP3', downloader.youtube, { cooldownMs: 15_000, cost: 50 }),
        command(['ytmp4'], 'ytmp4 [url]', 'YouTube to MP4', downloader.youtube, { cooldownMs: 15_000, cost: 50 }),
        command(['tiktok', 'tt'], 'tiktok [url]', 'TikTok video', downloader.tiktok, { cooldownMs: 15_000, cost: 30 })
    ]],
    ['STICKER', [
        command(['sticker', 's'], 'sticker [caption]', 'Make a sticker from an image/video; optional bottom caption', sticker.makeSticker, { cooldownMs: 5_000, cost: 15 }),
        command(['brat'], 'brat <text>', 'Make a brat-style sticker from text or a replied message', brat.brat, { cooldownMs: 5_000, cost: 15 })
    ]],
    ['GAMES', [
        // Werewolf charges for `create` only — handled inside the command.
        command(['werewolf', 'ww'], 'werewolf <create|join|start|vote>', 'Play Werewolf in WhatsApp', werewolf.werewolf, { cooldownMs: 1_000 }),
        command(['tebaklagukpop', 'tebakkpop'], 'tebaklagukpop [stop]', 'Guess the K-pop song from the hint (entry: 25 coins, reward: 50 coins)', tebaklagukpop.start, { cooldownMs: 5_000 }),
        command(['tebakanime', 'animequiz'], 'tebakanime [stop]', 'Guess the anime title from the hint (entry: 25 coins, reward: 50 coins)', tebakanime.start, { cooldownMs: 5_000 })
    ]],
    ['ECONOMY', [
        command(['balance', 'bal', 'money'], 'balance [@user]', 'Check coin balance (group or personal in DM)', economy.balance),
        command(['daily'], 'daily', 'Claim daily coins (group or personal in DM)', economy.daily, { cooldownMs: 1_000 }),
        command(['work'], 'work', 'Earn coins (group or personal in DM)', economy.work, { cooldownMs: 1_000 }),
        command(['give', 'pay'], 'give @user <amount>', 'Give coins to another user (same scope)', economy.give),
        command(['coinflip', 'cf'], 'coinflip <heads|tails> <amount>', 'Bet your coins on a coin flip', economy.coinflip, { cooldownMs: 3_000 }),
        command(['richest', 'leaderboard'], 'richest', 'Coin leaderboard for this scope', economy.leaderboard),
        command(['economy', 'eco'], 'economy <help|add|remove|set|reset>', 'Economy help and owner tools', economy.economy)
    ]],
    ['GROUP TOOLS', [
        command(['kick'], 'kick @user', 'Kick a member', group.kick),
        command(['add'], 'add [number]', 'Add a member', group.add),
        command(['promote'], 'promote @user', 'Make admin', group.promote),
        command(['demote'], 'demote @user', 'Remove admin', group.demote),
        command(['mute'], 'mute', 'Mute the group', group.mute),
        command(['unmute'], 'unmute', 'Unmute the group', group.unmute),
        command(['tagall'], 'tagall', 'Tag all members', group.tagAll, { cooldownMs: 10_000 }),
        command(['hidetag'], 'hidetag [msg]', 'Silent tag all', group.hideTag, { cooldownMs: 10_000 }),
        command(['groupinfo'], 'groupinfo', 'Show group info', group.groupInfo),
        command(['groupadmin'], 'groupadmin', 'List all admins', group.groupAdmin),
        command(['descgc'], 'descgc', 'Show group description', group.descGc),
        command(['setnamegc'], 'setnamegc [name]', 'Rename group', group.setNameGc),
        command(['setdescgc'], 'setdescgc [desc]', 'Set description', group.setDescGc),
        command(['setopen'], 'setopen', 'Open group', group.setOpen),
        command(['setclose'], 'setclose', 'Close group', group.setClose),
        command(['linkgc'], 'linkgc', 'Get invite link', group.linkGc),
        command(['revokelink'], 'revokelink', 'Revoke invite link', group.revokeLink),
        command(['pinmsg'], 'pinmsg', 'Pin a message', group.pinMsg),
        command(['unpinmsg'], 'unpinmsg', 'Unpin a message', group.unpinMsg),
        command(['delete'], 'delete', 'Delete a message', group.deleteMsg),
        command(['leavegc'], 'leavegc', 'Bot leaves group', group.leaveGc),
        command(['refreshgroup'], 'refreshgroup', 'Refresh group data', group.refreshGroup),
        command(['kickme'], 'kickme', 'Leave the group yourself', group.kickMe),
        command(['welcome'], 'welcome on/off', 'Toggle welcome msg', group.welcome),
        command(['setwelcome'], 'setwelcome [msg]', 'Set welcome msg', group.setWelcome),
        command(['setleft'], 'setleft [msg]', 'Set goodbye msg', group.setLeft),
        command(['antilink'], 'antilink on/off', 'Toggle anti-link', group.antiLink),
        command(['antidelete'], 'antidelete on/off', 'Toggle anti-delete', group.antiDelete),
        command(['antibadword'], 'antibadword on/off', 'Toggle anti-badword', group.antiBadWord),
        command(['antibot'], 'antibot on/off', 'Toggle anti-bot', group.antiBot),
        command(['addbadword'], 'addbadword [word]', 'Add bad word', group.addBadWord),
        command(['delbadword'], 'delbadword [word]', 'Remove bad word', group.delBadWord),
        command(['listbadword'], 'listbadword', 'List bad words', group.listBadWord),
        command(['resetbadword'], 'resetbadword', 'Reset bad words', group.resetBadWord),
        command(['warn'], 'warn @user', 'Warn a member', group.warn),
        command(['resetwarn'], 'resetwarn @user', 'Reset warnings', group.resetWarn),
        command(['listwarn'], 'listwarn', 'List warned members', group.listWarn),
        command(['afk'], 'afk [reason]', 'Set AFK status', group.afk),
        command(['blacklist'], 'blacklist @user', 'Blacklist a user', blacklist.addBlacklist),
        command(['delblacklist'], 'delblacklist @user', 'Remove from blacklist', blacklist.delBlacklist),
        command(['listblacklist'], 'listblacklist', 'List blacklisted users', blacklist.listBlacklist),
        command(['resetblacklist'], 'resetblacklist', 'Reset blacklist', blacklist.resetBlacklist),
        command(['addlist'], 'addlist name|content', 'Add a list', list.addList),
        command(['updatelist', 'uplist'], 'updatelist name|content', 'Update a list', list.updateList),
        command(['getlist', 'list'], 'getlist [name]', 'Get a list', list.getList),
        command(['dellist'], 'dellist [name]', 'Delete a list', list.delList),
        command(['resetlist'], 'resetlist', 'Reset all lists', list.resetList),
        command(['vote'], 'vote question|opt1|opt2', 'Start a vote', vote.vote),
        command(['voteresult'], 'voteresult', 'See vote results', vote.voteResult),
        command(['votestop'], 'votestop', 'End the vote', vote.voteStop),
        command(['mulaiabsen'], 'mulaiabsen [topic]', 'Start attendance', absen.mulaiAbsen),
        command(['absen'], 'absen', 'Mark your attendance', absen.absen),
        command(['cekabsen'], 'cekabsen', 'Check attendance list', absen.cekAbsen),
        command(['deleteabsen'], 'deleteabsen', 'End attendance session', absen.deleteAbsen),
        command(['totalpesan'], 'totalpesan', 'Your message count', totalpesan.totalPesan),
        command(['listtotalpesan'], 'listtotalpesan', 'Top message senders', totalpesan.listTotalPesan),
        command(['deletetotalpesan'], 'deletetotalpesan @user', 'Delete user count', totalpesan.deleteTotalPesan),
        command(['resettotalpesan'], 'resettotalpesan', 'Reset all counts', totalpesan.resetTotalPesan)
    ]],
    ['ALARM & REMINDER', [
        command(['addalarm'], 'addalarm name | HH:MM | message', 'Create a daily alarm', alarm.addAlarm),
        command(['delalarm'], 'delalarm [name]', 'Delete an alarm', alarm.delAlarm),
        command(['listalarm'], 'listalarm', 'List alarms', alarm.listAlarm),
        command(['enablealarm'], 'enablealarm [name]', 'Enable an alarm', alarm.enableAlarm),
        command(['disablealarm'], 'disablealarm [name]', 'Disable an alarm', alarm.disableAlarm),
        command(['resetalarm'], 'resetalarm', 'Delete all alarms', alarm.resetAlarm),
        command(['addreminder'], 'addreminder name | DD/MM/YYYY HH:MM | message', 'Create a one-time reminder', reminder.addReminder),
        command(['delreminder'], 'delreminder [name]', 'Delete a reminder', reminder.delReminder),
        command(['listreminder'], 'listreminder', 'List reminders', reminder.listReminder),
        command(['resetreminder'], 'resetreminder', 'Delete all reminders', reminder.resetReminder),
        command(['settimezone'], 'settimezone [zone]', 'Set group timezone', alarm.setTimezone)
    ]],
    ['AI', [
        command(['ai', 'chat'], 'ai [question]', 'Ask AI anything', ai.chat, { cooldownMs: 5_000, cost: 10 }),
        command(['aireset', 'chatreset'], 'aireset', 'Reset your AI chat context', ai.reset)
    ]],
    ['GENERAL', [
        command(['ping'], 'ping', 'Bot response speed', general.ping),
        command(['runtime', 'uptime'], 'runtime', 'How long the bot has been running', general.runtime),
        command(['infobot', 'botinfo'], 'infobot', 'Bot and system info', general.infobot)
    ]],
    ['TOOLS', [
        command(['translate', 'tr'], 'translate <lang> <text>', 'Translate text or a replied message', translate.translate, { cooldownMs: 3_000 }),
        command(['qrcode', 'qr'], 'qrcode <text>', 'Generate a QR code', qrcode.qrcode, { cooldownMs: 3_000 }),
        command(['tts'], 'tts <lang> <text>', 'Text-to-speech voice note', tts.tts, { cooldownMs: 5_000 }),
        command(['ocr'], 'ocr [lang]', 'Read text from an image (reply to image)', ocr.ocr, { cooldownMs: 10_000 }),
        command(['dailynews', 'news'], 'dailynews [category]', 'Top headlines (general, economy, politics, tech, kpop, music, ...)', dailynews.dailynews, { cooldownMs: 10_000 })
    ]]
]

const commands = categories.flatMap(([, entries]) => entries)
const commandMap = new Map()

for (const entry of commands) {
    for (const alias of entry.aliases) {
        if (commandMap.has(alias)) {
            throw new Error(`Duplicate command alias: ${alias}`)
        }
        commandMap.set(alias, entry)
    }
}

function command(aliases, usage, description, handler, options = {}) {
    return {
        name: aliases[0],
        aliases,
        usage,
        description,
        handler,
        cooldownMs: options.cooldownMs || 0,
        cost: options.cost || 0
    }
}

function findCommand(name) {
    return commandMap.get(String(name || '').toLowerCase())
}

function renderMenu({ prefix, botName, pushname, balance, status }) {
    const lines = []

    lines.push('ㅤׄ  ᰅᰅ  ׅ  ⠎⠣⠜⠱ ׅ   ׄ  𖹭𖹭')
    lines.push(`ㅤׅ  ׄ  ⸼ ૮꒰ ៸៸ ◞ ◟ ៸៸ ꒱ა  ׅ  *${botName} ⦂ ֵ  🤖*`)
    lines.push('')
    lines.push('╭──ֵ─ׄ─ׅ┈   ─ׄ─ׅ─꯭۫──۪┈╮')
    lines.push('')
    lines.push('')
    lines.push('ׄ  ׅ  ⓘ  ᥳׅ᥍ׄꫀׅr ꪱ๋𝗇ẜᨷׅ')
    lines.push(`ׅ  ۫  ⸼ ׄ📮៸៸ *name* ⦂ ${pushname}`)
    lines.push(`ׅ  ۫  ⸼ ׄ📮៸៸ *balance* ⦂ ${balance}`)
    lines.push(`ׅ  ۫  ⸼ ׄ📮៸៸ *status* ⦂ ${status}`)
    lines.push('')
    lines.push('ׄ  ׅ  ⓘ  rᥳׅІꫀׅ᥍ׄ')
    lines.push('ׄ  ׅ  𑊑 ׄ  ⓪① ׄ  𝅄  dilarang call')
    lines.push('ׄ  ׅ  𑊑 ׄ  ⓪② ׄ  𝅄  dilarang spam')
    lines.push('ׄ  ׅ  𑊑 ׄ  ⓪③ ׄ  𝅄  dilarang kick bot bagi yang sewa')
    lines.push('')

    for (const [category, entries] of categories) {
        lines.push(`*${category}*`)
        for (const entry of entries) {
            lines.push(`- ${prefix}${entry.name}`)
        }
        lines.push('')
    }

    return lines.join('\n').trimEnd()
}

function renderCommandHelp(name, prefix) {
    const entry = findCommand(name)
    if (!entry) return null

    const aliases = entry.aliases.length > 1
        ? `\nAliases: ${entry.aliases.map(alias => `*${prefix}${alias}*`).join(', ')}`
        : ''
    const cooldown = entry.cooldownMs
        ? `\nCooldown: ${Math.ceil(entry.cooldownMs / 1000)}s`
        : ''
    const cost = entry.cost
        ? `\nCost: ${entry.cost} coins (per use, group-scoped)`
        : ''

    return `*${prefix}${entry.name}*\n${entry.description}\n\nUsage: *${prefix}${entry.usage}*${aliases}${cooldown}${cost}`
}

module.exports = {
    commands,
    commandMap,
    findCommand,
    renderMenu,
    renderCommandHelp
}
