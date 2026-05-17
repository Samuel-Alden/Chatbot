const db = require('../utils/db')
const config = require('../config')
const { getMentions, normalizeJid } = require('../utils/helper')

const economy = db.load('economy')
if (!economy.groups) economy.groups = {}
if (!economy.personal) economy.personal = {}
if (economy.users) {
    if (Object.keys(economy.users).length && !economy.legacyGlobalUsers) {
        economy.legacyGlobalUsers = economy.users
    }
    delete economy.users
}

const DAILY_COOLDOWN_MS = 24 * 60 * 60_000
const DAILY_BASE = 100
const DAILY_STREAK_BONUS = 25
const DAILY_MAX_BONUS = 100
const WORK_COOLDOWN_MS = 45 * 60_000
const MIN_GAMBLE = 25
const MAX_GAMBLE = 5_000

const jobs = [
    ['helped a merchant carry crates', 50, 150],
    ['fixed a broken group chat bot', 100, 200],
    ['delivered spicy noodles across town', 50, 150],
    ['translated suspiciously dramatic voice notes', 100, 200],
    ['organized a chaotic sticker collection', 50, 150],
    ['debugged someone else\'s mystery error', 130, 300],
    ['won a tiny trivia tournament', 100, 230],
    ['moderated a very loud village meeting', 110, 250]
]

// Generic helpers other commands use to gate features behind coins.
// Owner is always exempt. Groups use group-scoped wallets, DMs use personal wallets.
function charge(ctx, amount) {
    if (ctx.isOwner || !amount) return { ok: true, charged: 0 }
    const scope = getScope(ctx)
    const user = getUser(scope, ctx.senderNumber)
    if (user.balance < amount) {
        return { ok: false, reason: 'insufficient', balance: user.balance, needed: amount }
    }
    debit(scope, ctx.senderNumber, amount)
    save()
    return { ok: true, charged: amount, balance: user.balance }
}

// Punishment-style charge: takes whatever the user has up to `amount`.
// Never errors out for insufficient funds — just drains the wallet.
// Returns { ok, charged, balance } where `charged` is what was actually taken.
function chargeMax(ctx, amount) {
    if (ctx.isOwner || !amount) return { ok: true, charged: 0, balance: 0 }
    const scope = getScope(ctx)
    const user = getUser(scope, ctx.senderNumber)
    const toCharge = Math.min(amount, user.balance)
    if (toCharge <= 0) return { ok: true, charged: 0, balance: user.balance }
    debit(scope, ctx.senderNumber, toCharge)
    save()
    return { ok: true, charged: toCharge, balance: user.balance }
}

function refund(ctx, amount) {
    if (ctx.isOwner || !amount) return
    const scope = getScope(ctx)
    const user = getUser(scope, ctx.senderNumber)
    // Undo the spent-stat bump so a refund doesn't inflate lifetime spending.
    user.stats.spent = Math.max(0, (user.stats.spent || 0) - amount)
    credit(scope, ctx.senderNumber, amount)
    user.stats.earned = Math.max(0, (user.stats.earned || 0) - amount)
    save()
}

function getBalance(ctx) {
    const scope = getScope(ctx)
    const user = getUser(scope, ctx.senderNumber)
    return user.balance
}

// Public credit for game rewards, prizes, etc. Owner participates too —
// charge/chargeMax/refund still exempt the owner (so paid commands stay
// free for them), but rewards always credit so the owner can play games.
function reward(ctx, amount) {
    if (!amount) return { ok: true, credited: 0 }
    const scope = getScope(ctx)
    credit(scope, ctx.senderNumber, amount)
    save()
    return { ok: true, credited: amount, balance: getUser(scope, ctx.senderNumber).balance }
}

module.exports = {
    charge,
    chargeMax,
    refund,
    reward,
    getBalance,
    balance: async (ctx) => {
        const scope = getScope(ctx)
        const target = getTargetUser(ctx) || { jid: ctx.sender, num: ctx.senderNumber }
        const user = getUser(scope, target.num)

        await ctx.sock.sendMessage(ctx.from, {
            text:
                `🪙 *Balance*\n\n` +
                `${mention(target.num)} has *${formatCoins(user.balance)}* in ${scope.label}.\n` +
                `Daily streak: *${user.dailyStreak || 0}*`,
            mentions: [targetMentionJid(target)]
        }, { quoted: ctx.msg })
    },

    daily: async (ctx) => {
        const scope = getScope(ctx)
        const user = getUser(scope, ctx.senderNumber)
        const now = Date.now()
        const remaining = user.lastDaily + DAILY_COOLDOWN_MS - now

        if (remaining > 0) {
            return reply(ctx, `⏳ You already claimed daily coins in ${scope.label}. Come back in *${formatDuration(remaining)}*.`)
        }

        const streakContinues = user.lastDaily && now - user.lastDaily <= DAILY_COOLDOWN_MS * 2
        user.dailyStreak = streakContinues ? (user.dailyStreak || 0) + 1 : 1

        const bonus = Math.min((user.dailyStreak - 1) * DAILY_STREAK_BONUS, DAILY_MAX_BONUS)
        const amount = DAILY_BASE + bonus
        credit(scope, ctx.senderNumber, amount)
        user.lastDaily = now
        user.stats.dailyClaims = (user.stats.dailyClaims || 0) + 1
        save()

        await reply(ctx,
            `🎁 *Daily claimed!*\n\n` +
            `You received *${formatCoins(amount)}* in ${scope.label}.\n` +
            `Streak: *${user.dailyStreak}* day(s)` +
            (bonus ? `\nStreak bonus: *${formatCoins(bonus)}*` : '')
        )
    },

    work: async (ctx) => {
        const scope = getScope(ctx)
        const user = getUser(scope, ctx.senderNumber)
        const now = Date.now()
        const remaining = user.lastWork + WORK_COOLDOWN_MS - now

        if (remaining > 0) {
            return reply(ctx, `⏳ You need a break. Work again in *${formatDuration(remaining)}*.`)
        }

        const [job, min, max] = jobs[Math.floor(Math.random() * jobs.length)]
        const amount = randomInt(min, max)
        user.lastWork = now
        credit(scope, ctx.senderNumber, amount)
        user.stats.workCount = (user.stats.workCount || 0) + 1
        save()

        await reply(ctx, `💼 You ${job} and earned *${formatCoins(amount)}* in ${scope.label}.`)
    },

    give: async (ctx) => {
        const scope = getScope(ctx)
        const target = getTargetUser(ctx)
        if (!target) return reply(ctx, `❌ Specify a recipient.\nExample: *${config.prefix}give @user 250* (or *${config.prefix}give 628xxx 250* in DM)`)
        if (target.num === ctx.senderNumber) return reply(ctx, '❌ You cannot give coins to yourself.')

        const amount = parseAmount(ctx.args, target.consumedArg)
        if (!amount) return reply(ctx, `❌ Provide a valid amount.\nExample: *${config.prefix}give @user 250*`)
        if (!debit(scope, ctx.senderNumber, amount)) {
            return reply(ctx, `❌ You need *${formatCoins(amount)}*, but you only have *${formatCoins(getUser(scope, ctx.senderNumber).balance)}* in ${scope.label}.`)
        }

        credit(scope, target.num, amount)
        save()

        await ctx.sock.sendMessage(ctx.from, {
            text: `✅ ${mention(ctx.senderNumber)} gave *${formatCoins(amount)}* to ${mention(target.num)} in ${scope.label}.`,
            mentions: [ctx.sender, targetMentionJid(target)]
        }, { quoted: ctx.msg })
    },

    coinflip: async (ctx) => {
        const scope = getScope(ctx)
        const parsed = parseCoinflip(ctx.args)
        if (!parsed) {
            return reply(ctx, `❌ Usage: *${config.prefix}coinflip heads ${MIN_GAMBLE}*\nChoose *heads* or *tails* and an amount.`)
        }

        const { choice, amount } = parsed
        if (amount < MIN_GAMBLE) return reply(ctx, `❌ Minimum bet is *${formatCoins(MIN_GAMBLE)}*.`)
        if (amount > MAX_GAMBLE) return reply(ctx, `❌ Maximum bet is *${formatCoins(MAX_GAMBLE)}*.`)
        if (!debit(scope, ctx.senderNumber, amount)) {
            return reply(ctx, `❌ Not enough coins in ${scope.label}. Balance: *${formatCoins(getUser(scope, ctx.senderNumber).balance)}*.`)
        }

        const result = Math.random() < 0.5 ? 'heads' : 'tails'
        const won = result === choice
        const user = getUser(scope, ctx.senderNumber)

        if (won) {
            credit(scope, ctx.senderNumber, amount * 2)
            user.stats.gambleWon = (user.stats.gambleWon || 0) + amount
        } else {
            user.stats.gambleLost = (user.stats.gambleLost || 0) + amount
        }
        save()

        await reply(ctx,
            `🪙 The coin landed on *${result}*.\n\n` +
            (won
                ? `You won *${formatCoins(amount)}*!`
                : `You lost *${formatCoins(amount)}*.`) +
            `\nBalance in ${scope.label}: *${formatCoins(getUser(scope, ctx.senderNumber).balance)}*`
        )
    },

    leaderboard: async (ctx) => {
        const scope = getScope(ctx)
        const entries = Object.entries(scope.users)
            .filter(([, user]) => (user.balance || 0) > 0)
            .sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0))
            .slice(0, 10)

        if (!entries.length) {
            return reply(ctx, `🪙 Nobody has coins in ${scope.label} yet. Try *${config.prefix}daily* or *${config.prefix}work* first.`)
        }
        const text = entries.map(([num, user], index) =>
            `${index + 1}. ${mention(num)} - *${formatCoins(user.balance || 0)}*`
        ).join('\n')

        const title = scope.isPersonal ? 'Richest Players (Personal Wallets)' : 'Richest Players In This Group'
        await ctx.sock.sendMessage(ctx.from, {
            text: `🏆 *${title}*\n\n${text}`,
            mentions: entries.map(([num]) => toJid(num))
        }, { quoted: ctx.msg })
    },

    economy: async (ctx) => {
        const [subRaw] = ctx.args
        const sub = (subRaw || 'help').toLowerCase()

        if (sub === 'help') return economyHelp(ctx)
        if (!['add', 'remove', 'set', 'reset'].includes(sub)) {
            return reply(ctx, `❌ Unknown economy action: *${sub}*\nType *${config.prefix}economy help*.`)
        }
        if (!ctx.isOwner) return reply(ctx, '❌ Only the owner can use economy admin commands.')

        const scope = getScope(ctx)
        const target = getTargetUser(ctx)
        if (!target) return reply(ctx, `❌ Specify a user.\nExample: *${config.prefix}eco ${sub} @user 100*`)

        if (sub === 'reset') {
            scope.users[normalizeJid(target.num)] = makeUser()
            save()
            return reply(ctx, `✅ Reset economy data for ${mention(target.num)} in ${scope.label}.`, [targetMentionJid(target)])
        }

        const amount = parseAmount(ctx.args, target.consumedArg)
        if (!amount) return reply(ctx, `❌ Provide a valid amount.\nExample: *${config.prefix}eco ${sub} @user 100*`)

        if (sub === 'add') credit(scope, target.num, amount)
        if (sub === 'remove') {
            const user = getUser(scope, target.num)
            user.balance = Math.max(0, user.balance - amount)
        }
        if (sub === 'set') getUser(scope, target.num).balance = amount
        save()

        await ctx.sock.sendMessage(ctx.from, {
            text: `✅ ${mention(target.num)} now has *${formatCoins(getUser(scope, target.num).balance)}* in ${scope.label}.`,
            mentions: [targetMentionJid(target)]
        }, { quoted: ctx.msg })
    }
}

function economyHelp(ctx) {
    return reply(ctx,
        `🪙 *Economy Commands*\n\n` +
        `Each group has its own wallet, and DMs use a separate *personal wallet*. ` +
        `Coins in one scope cannot be spent in another.\n\n` +
        `*Players*\n` +
        `${config.prefix}balance [@user] - Check balance in this scope\n` +
        `${config.prefix}daily - Claim daily coins\n` +
        `${config.prefix}work - Earn coins\n` +
        `${config.prefix}give @user <amount> - Send coins to another user\n` +
        `${config.prefix}coinflip <heads|tails> <amount> - Bet your coins\n` +
        `${config.prefix}richest - Show the leaderboard for this scope\n\n` +
        `*Owner*\n` +
        `${config.prefix}eco add @user <amount>\n` +
        `${config.prefix}eco remove @user <amount>\n` +
        `${config.prefix}eco set @user <amount>\n` +
        `${config.prefix}eco reset @user`
    )
}

function getScope(ctx) {
    if (ctx.isGroup) {
        if (!economy.groups[ctx.from]) economy.groups[ctx.from] = { users: {} }
        if (!economy.groups[ctx.from].users) economy.groups[ctx.from].users = {}
        return {
            users: economy.groups[ctx.from].users,
            label: 'this group',
            isPersonal: false
        }
    }
    return {
        users: economy.personal,
        label: 'your personal wallet',
        isPersonal: true
    }
}

function getUser(scope, num) {
    const key = normalizeJid(num)
    if (!scope.users[key]) scope.users[key] = makeUser()
    const user = scope.users[key]
    user.balance = normalizeNumber(user.balance)
    user.lastDaily = normalizeNumber(user.lastDaily)
    user.dailyStreak = normalizeNumber(user.dailyStreak)
    user.lastWork = normalizeNumber(user.lastWork)
    if (!user.stats) user.stats = {}
    user.stats.earned = normalizeNumber(user.stats.earned)
    user.stats.spent = normalizeNumber(user.stats.spent)
    return user
}

function makeUser() {
    return {
        balance: 0,
        lastDaily: 0,
        dailyStreak: 0,
        lastWork: 0,
        stats: {
            earned: 0,
            spent: 0
        }
    }
}

function credit(scope, num, amount) {
    const user = getUser(scope, num)
    user.balance += amount
    user.stats.earned = (user.stats.earned || 0) + amount
}

function debit(scope, num, amount, options = {}) {
    const user = getUser(scope, num)
    if (!options.allowNegative && user.balance < amount) return false
    user.balance -= amount
    user.stats.spent = (user.stats.spent || 0) + amount
    return true
}

function save() {
    db.save('economy', economy)
}

function getTargetUser(ctx) {
    const meArg = ctx.args.find(arg => String(arg || '').toLowerCase() === 'me')
    if (meArg) {
        return { jid: ctx.sender, num: ctx.senderNumber, consumedArg: meArg }
    }

    const mentions = getMentions(ctx.msg)
    if (mentions.length) {
        const num = normalizeJid(mentions[0])
        return { jid: mentions[0], num, consumedArg: null }
    }

    const numberArg = ctx.args.find(arg => /^\d{8,15}$/.test(arg.replace(/\D/g, '')))
    if (!numberArg) return null

    const num = numberArg.replace(/\D/g, '')
    return { jid: toJid(num), num, consumedArg: numberArg }
}

function parseAmount(args, excludeArg) {
    const amountArg = args.find(arg => /^\d+$/.test(arg) && arg !== excludeArg)
    if (!amountArg) return null

    const amount = Number(amountArg)
    if (!Number.isSafeInteger(amount) || amount <= 0) return null
    return amount
}

function parseCoinflip(args) {
    const choiceArg = args.find(arg => ['heads', 'head', 'h', 'tails', 'tail', 't'].includes(arg.toLowerCase()))
    const amount = parseAmount(args)
    if (!choiceArg || !amount) return null

    const choice = choiceArg.toLowerCase().startsWith('h') ? 'heads' : 'tails'
    return { choice, amount }
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min
}

function normalizeNumber(value) {
    const number = Number(value)
    return Number.isFinite(number) ? number : 0
}

function formatCoins(amount) {
    return `${Number(amount || 0).toLocaleString('en-US')} coins`
}

function formatDuration(ms) {
    const totalSeconds = Math.ceil(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    const parts = []
    if (hours) parts.push(`${hours}h`)
    if (minutes) parts.push(`${minutes}m`)
    if (!hours && !minutes) parts.push(`${seconds}s`)
    return parts.join(' ')
}

function mention(numOrJid) {
    return `@${normalizeJid(numOrJid)}`
}

function toJid(numOrJid) {
    const value = String(numOrJid)
    return value.includes('@') ? value : `${normalizeJid(value)}@s.whatsapp.net`
}

function targetMentionJid(target) {
    const jid = target?.jid ? String(target.jid) : ''
    if (jid.includes('@')) return jid
    return toJid(target?.num || '')
}

async function reply(ctx, text, mentions = []) {
    await ctx.sock.sendMessage(ctx.from, { text, mentions }, { quoted: ctx.msg })
}
