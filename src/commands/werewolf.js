const config = require('../config')
const { getMentions, isAdmin, normalizeJid } = require('../utils/helper')
const economy = require('./economy')

const CREATE_COST = 100

const MIN_PLAYERS = 4
const games = new Map()
const playerGroups = new Map()

const ROLE_NAMES = {
    werewolf: 'Werewolf',
    villager: 'Villager',
    seer: 'Seer',
    doctor: 'Doctor'
}

const ROLE_HELP = {
    werewolf: 'Each night, choose one player to eliminate.',
    villager: 'Find the werewolves during the day and vote them out.',
    seer: 'Each night, inspect one player to learn if they are a werewolf.',
    doctor: 'Each night, protect one living player from the werewolves.'
}

module.exports = {
    werewolf: async (ctx) => {
        const [subRaw, ...rest] = ctx.args
        const sub = (subRaw || '').toLowerCase()
        const text = rest.join(' ')

        if (!sub || sub === 'help') return sendHelp(ctx)

        switch (sub) {
            case 'create':
                return createGame(ctx)
            case 'join':
                return joinGame(ctx)
            case 'leave':
                return leaveGame(ctx)
            case 'players':
            case 'list':
                return listPlayers(ctx)
            case 'start':
                return startGame(ctx)
            case 'status':
                return status(ctx)
            case 'vote':
                return vote(ctx, text)
            case 'votes':
                return voteStatus(ctx)
            case 'kill':
                return nightKill(ctx, text)
            case 'see':
            case 'inspect':
                return seerInspect(ctx, text)
            case 'protect':
                return doctorProtect(ctx, text)
            case 'skip':
                return skipNightAction(ctx)
            case 'dawn':
                return forceDawn(ctx)
            case 'night':
                return forceNight(ctx)
            case 'end':
            case 'stop':
                return endGame(ctx)
            default:
                return reply(ctx, `❌ Unknown werewolf action: *${sub}*\nType *${config.prefix}werewolf help*.`)
        }
    }
}

async function createGame(ctx) {
    if (!ctx.isGroup) return reply(ctx, '❌ Create a Werewolf game inside a group.')
    if (games.has(ctx.from)) return reply(ctx, '❌ A Werewolf game already exists in this group.')
    if (isPlayerBusy(ctx.sender, ctx.from)) {
        return reply(ctx, '❌ You are already in another Werewolf game.')
    }

    const charge = economy.charge(ctx, CREATE_COST)
    if (!charge.ok) {
        return reply(ctx, `❌ Starting a Werewolf game costs *${CREATE_COST} coins*, but you only have *${charge.balance} coins*.\nEarn more with *${config.prefix}daily* or *${config.prefix}work*.`)
    }

    const game = {
        groupId: ctx.from,
        host: ctx.sender,
        phase: 'lobby',
        day: 0,
        players: [makePlayer(ctx.sender, ctx.msg.pushName)],
        roles: {},
        alive: {},
        votes: {},
        nightActions: {},
        createdAt: Date.now()
    }

    games.set(ctx.from, game)
    setPlayerGroup(ctx.sender, ctx.from)

    await reply(ctx,
        `🐺 *Werewolf lobby created!*\n\n` +
        `Host: ${mention(ctx.sender)}\n` +
        `Players: 1/${MIN_PLAYERS} minimum\n\n` +
        `Type *${config.prefix}werewolf join* to play.\n` +
        `Host/admin can start with *${config.prefix}werewolf start*.`,
        [ctx.sender]
    )
}

async function joinGame(ctx) {
    if (!ctx.isGroup) return reply(ctx, '❌ Join a Werewolf game from the group lobby.')

    const game = games.get(ctx.from)
    if (!game) return reply(ctx, `❌ No Werewolf lobby here. Start one with *${config.prefix}werewolf create*.`)
    if (game.phase !== 'lobby') return reply(ctx, '❌ This Werewolf game has already started.')
    if (findPlayer(game, ctx.sender)) return reply(ctx, '✅ You are already in the lobby.')
    if (isPlayerBusy(ctx.sender, ctx.from)) return reply(ctx, '❌ You are already in another Werewolf game.')

    game.players.push(makePlayer(ctx.sender, ctx.msg.pushName))
    setPlayerGroup(ctx.sender, ctx.from)

    await reply(ctx,
        `✅ ${mention(ctx.sender)} joined the Werewolf lobby.\n\n` +
        `Players: ${game.players.length}/${MIN_PLAYERS} minimum`,
        [ctx.sender]
    )
}

async function leaveGame(ctx) {
    const game = getContextGame(ctx)
    if (!game) return reply(ctx, '❌ You are not in a Werewolf game.')
    if (game.phase !== 'lobby') return reply(ctx, '❌ You cannot leave after the game has started.')

    const player = findPlayer(game, ctx.sender)
    if (!player) return reply(ctx, '❌ You are not in this Werewolf lobby.')

    game.players = game.players.filter(p => p.jid !== player.jid)
    deletePlayerGroup(player.jid)

    if (!game.players.length) {
        games.delete(game.groupId)
        return reply(ctx, '✅ You left the lobby. The empty Werewolf game was removed.')
    }

    if (game.host === player.jid) game.host = game.players[0].jid
    await reply(ctx, `✅ ${mention(player.jid)} left the Werewolf lobby.`, [player.jid])
}

async function listPlayers(ctx) {
    const game = getContextGame(ctx)
    if (!game) return reply(ctx, '❌ No Werewolf game found.')

    const players = game.players.map((player, index) => {
        const statusText = game.phase === 'lobby'
            ? ''
            : game.alive[player.jid] ? ' - alive' : ' - dead'
        return `${index + 1}. ${mention(player.jid)}${statusText}`
    })

    await reply(ctx,
        `🐺 *Werewolf Players*\n` +
        `Phase: *${game.phase}*\n\n${players.join('\n')}`,
        game.players.map(p => p.jid)
    )
}

async function startGame(ctx) {
    if (!ctx.isGroup) return reply(ctx, '❌ Start the Werewolf game from the group.')

    const game = games.get(ctx.from)
    if (!game) return reply(ctx, `❌ No Werewolf lobby here. Start one with *${config.prefix}werewolf create*.`)
    if (game.phase !== 'lobby') return reply(ctx, '❌ This Werewolf game has already started.')
    if (!await canControlGame(ctx, game)) return reply(ctx, '❌ Only the host, a group admin, or the owner can start this game.')
    if (game.players.length < MIN_PLAYERS) {
        return reply(ctx, `❌ Need at least *${MIN_PLAYERS}* players. Current players: *${game.players.length}*.`)
    }

    assignRoles(game)
    game.phase = 'night'
    game.day = 1
    game.votes = {}
    game.nightActions = { kills: {} }

    const failed = []
    for (const player of game.players) {
        try {
            await ctx.sock.sendMessage(player.jid, { text: roleMessage(game, player) })
        } catch (err) {
            failed.push(player.jid)
            console.error('[WEREWOLF DM ERROR]', player.jid, err.message)
        }
    }

    await ctx.sock.sendMessage(game.groupId, {
        text:
            `🐺 *Werewolf has started!*\n\n` +
            `Players: *${game.players.length}*\n` +
            `Roles were sent by private message.\n\n` +
            `🌙 *Night 1 begins.* Check your PM for night actions.` +
            (failed.length ? `\n\n⚠️ I could not PM: ${failed.map(mention).join(', ')}. They may need to message the bot first.` : ''),
        mentions: failed
    })

    await sendNightPrompts(ctx.sock, game)
}

async function status(ctx) {
    const game = getContextGame(ctx)
    if (!game) return reply(ctx, '❌ No Werewolf game found.')

    const alive = alivePlayers(game)
    const dead = game.players.filter(player => !game.alive[player.jid])
    const privateHint = ctx.isGroup ? '' : `\nGroup: ${game.groupId}`

    await reply(ctx,
        `🐺 *Werewolf Status*\n` +
        `Phase: *${game.phase}*\n` +
        `Day: *${game.day || '-'}*\n` +
        `Alive: *${alive.length}*\n` +
        `Dead: *${dead.length}*${privateHint}\n\n` +
        formatAliveList(game)
    )
}

async function vote(ctx, targetText) {
    if (!ctx.isGroup) return reply(ctx, '❌ Day votes must be sent in the group.')

    const game = games.get(ctx.from)
    if (!game) return reply(ctx, '❌ No Werewolf game is running here.')
    if (game.phase !== 'day') return reply(ctx, '❌ Voting is only open during the day.')
    const voter = findPlayer(game, ctx.sender)
    if (!voter || !game.alive[voter.jid]) return reply(ctx, '❌ Only living players can vote.')

    const target = resolveTarget(ctx, game, targetText, alivePlayers(game))
    if (!target.player) return reply(ctx, target.error)
    if (sameJid(target.player.jid, voter.jid)) return reply(ctx, '❌ You cannot vote for yourself.')

    game.votes[voter.jid] = target.player.jid

    const tally = getVoteTally(game)
    const count = tally.get(target.player.jid)?.length || 0
    const needed = majorityNeeded(game)

    await reply(ctx,
        `🗳️ ${mention(voter.jid)} voted for ${mention(target.player.jid)}.\n` +
        `Votes: *${count}/${needed}* needed to eliminate.`,
        [voter.jid, target.player.jid]
    )

    if (count >= needed) {
        await eliminateByVote(ctx.sock, game, target.player)
    }
}

async function voteStatus(ctx) {
    const game = getContextGame(ctx)
    if (!game) return reply(ctx, '❌ No Werewolf game found.')
    if (game.phase !== 'day') return reply(ctx, '❌ Votes are only available during the day.')

    const tally = getVoteTally(game)
    if (!tally.size) return reply(ctx, '🗳️ No votes yet.')

    const lines = [...tally.entries()].map(([target, voters]) =>
        `${mention(target)}: *${voters.length}* vote(s) - ${voters.map(mention).join(', ')}`
    )
    const mentions = [...new Set([...tally.keys(), ...Object.keys(game.votes)])]

    await reply(ctx, `🗳️ *Vote Status*\nNeeded: *${majorityNeeded(game)}*\n\n${lines.join('\n')}`, mentions)
}

async function nightKill(ctx, targetText) {
    const game = getContextGame(ctx)
    if (!game) return reply(ctx, '❌ You are not in a Werewolf game.')
    if (ctx.isGroup) return reply(ctx, '❌ Werewolf kills must be sent by private message.')
    if (game.phase !== 'night') return reply(ctx, '❌ Werewolves can only kill at night.')
    const wolf = findPlayer(game, ctx.sender)
    if (!wolf || !game.alive[wolf.jid] || game.roles[wolf.jid] !== 'werewolf') {
        return reply(ctx, '❌ Only living werewolves can use this action.')
    }

    const candidates = alivePlayers(game).filter(player => game.roles[player.jid] !== 'werewolf')
    const target = resolveTarget(ctx, game, targetText, candidates)
    if (!target.player) return reply(ctx, target.error)

    game.nightActions.kills[wolf.jid] = target.player.jid
    await reply(ctx, `🐺 Target locked: *${displayName(target.player)}*.`)
    await maybeResolveNight(ctx.sock, game)
}

async function seerInspect(ctx, targetText) {
    const game = getContextGame(ctx)
    if (!game) return reply(ctx, '❌ You are not in a Werewolf game.')
    if (ctx.isGroup) return reply(ctx, '❌ Seer inspections must be sent by private message.')
    if (game.phase !== 'night') return reply(ctx, '❌ The seer can only inspect at night.')
    const seer = findPlayer(game, ctx.sender)
    if (!seer || !game.alive[seer.jid] || game.roles[seer.jid] !== 'seer') {
        return reply(ctx, '❌ Only the living seer can use this action.')
    }

    const candidates = alivePlayers(game).filter(player => !sameJid(player.jid, seer.jid))
    const target = resolveTarget(ctx, game, targetText, candidates)
    if (!target.player) return reply(ctx, target.error)

    game.nightActions.see = { actor: seer.jid, target: target.player.jid }
    const result = game.roles[target.player.jid] === 'werewolf'
        ? 'is a *Werewolf*.'
        : 'is *not* a Werewolf.'

    await reply(ctx, `🔮 ${displayName(target.player)} ${result}`)
    await maybeResolveNight(ctx.sock, game)
}

async function doctorProtect(ctx, targetText) {
    const game = getContextGame(ctx)
    if (!game) return reply(ctx, '❌ You are not in a Werewolf game.')
    if (ctx.isGroup) return reply(ctx, '❌ Doctor protections must be sent by private message.')
    if (game.phase !== 'night') return reply(ctx, '❌ The doctor can only protect at night.')
    const doctor = findPlayer(game, ctx.sender)
    if (!doctor || !game.alive[doctor.jid] || game.roles[doctor.jid] !== 'doctor') {
        return reply(ctx, '❌ Only the living doctor can use this action.')
    }

    const target = resolveTarget(ctx, game, targetText, alivePlayers(game))
    if (!target.player) return reply(ctx, target.error)

    game.nightActions.protect = { actor: doctor.jid, target: target.player.jid }
    await reply(ctx, `🛡️ Protection locked: *${displayName(target.player)}*.`)
    await maybeResolveNight(ctx.sock, game)
}

async function skipNightAction(ctx) {
    const game = getContextGame(ctx)
    if (!game) return reply(ctx, '❌ You are not in a Werewolf game.')
    if (ctx.isGroup) return reply(ctx, '❌ Night skips must be sent by private message.')
    if (game.phase !== 'night') return reply(ctx, '❌ There is no night action to skip right now.')
    const player = findPlayer(game, ctx.sender)
    if (!player || !game.alive[player.jid]) return reply(ctx, '❌ Dead players cannot act.')

    const role = game.roles[player.jid]
    if (role === 'seer') game.nightActions.see = { actor: player.jid, target: null }
    else if (role === 'doctor') game.nightActions.protect = { actor: player.jid, target: null }
    else return reply(ctx, '❌ Your role cannot skip a required night action.')

    await reply(ctx, '✅ Night action skipped.')
    await maybeResolveNight(ctx.sock, game)
}

async function forceDawn(ctx) {
    const game = getContextGame(ctx)
    if (!game) return reply(ctx, '❌ No Werewolf game found.')
    if (game.phase !== 'night') return reply(ctx, '❌ It is not night right now.')
    if (!await canControlGame(ctx, game)) return reply(ctx, '❌ Only the host, a group admin, or the owner can force dawn.')

    await resolveNight(ctx.sock, game)
}

async function forceNight(ctx) {
    const game = getContextGame(ctx)
    if (!game) return reply(ctx, '❌ No Werewolf game found.')
    if (game.phase !== 'day') return reply(ctx, '❌ It is not day right now.')
    if (!await canControlGame(ctx, game)) return reply(ctx, '❌ Only the host, a group admin, or the owner can force night.')

    await ctx.sock.sendMessage(game.groupId, {
        text: '🌙 The village could not agree. Night falls with no elimination.'
    })
    await startNight(ctx.sock, game)
}

async function endGame(ctx) {
    const game = getContextGame(ctx)
    if (!game) return reply(ctx, '❌ No Werewolf game found.')
    if (!await canControlGame(ctx, game)) return reply(ctx, '❌ Only the host, a group admin, or the owner can end this game.')

    cleanupGame(game)
    await ctx.sock.sendMessage(game.groupId, { text: '🛑 Werewolf game ended.' })
}

async function sendHelp(ctx) {
    await reply(ctx,
        `🐺 *Werewolf Commands*\n\n` +
        `*Group lobby*\n` +
        `${config.prefix}werewolf create - Create a lobby\n` +
        `${config.prefix}werewolf join - Join the lobby\n` +
        `${config.prefix}werewolf leave - Leave before start\n` +
        `${config.prefix}werewolf players - Show players\n` +
        `${config.prefix}werewolf start - Start the game\n\n` +
        `*Day phase*\n` +
        `${config.prefix}werewolf vote @user - Vote to eliminate\n` +
        `${config.prefix}werewolf votes - Show vote status\n\n` +
        `*Private night actions*\n` +
        `${config.prefix}werewolf kill 1 - Werewolf kill\n` +
        `${config.prefix}werewolf see 1 - Seer inspect\n` +
        `${config.prefix}werewolf protect 1 - Doctor protect\n` +
        `${config.prefix}werewolf skip - Seer/doctor skip\n\n` +
        `*Control*\n` +
        `${config.prefix}werewolf dawn - Force-resolve night\n` +
        `${config.prefix}werewolf night - Force night with no elimination\n` +
        `${config.prefix}werewolf end - End the game\n\n` +
        `Alias: *${config.prefix}ww*`
    )
}

async function sendNightPrompts(sock, game) {
    const wolves = aliveByRole(game, 'werewolf')
    const seer = aliveByRole(game, 'seer')[0]
    const doctor = aliveByRole(game, 'doctor')[0]
    const failed = []

    for (const wolf of wolves) {
        const candidates = alivePlayers(game).filter(player => game.roles[player.jid] !== 'werewolf')
        const pack = wolves.map(displayName).join(', ')
        const text =
            `🌙 *Night ${game.day}: Werewolf*\n\n` +
            `Your pack: ${pack}\n\n` +
            `Choose a victim:\n${formatTargetList(candidates)}\n\n` +
            `Reply here with *${config.prefix}werewolf kill <number>*`
        if (!await safePrivate(sock, wolf.jid, text)) failed.push(wolf.jid)
    }

    if (seer) {
        const candidates = alivePlayers(game).filter(player => player.jid !== seer.jid)
        const text =
            `🌙 *Night ${game.day}: Seer*\n\n` +
            `Inspect one player:\n${formatTargetList(candidates)}\n\n` +
            `Reply here with *${config.prefix}werewolf see <number>* or *${config.prefix}werewolf skip*`
        if (!await safePrivate(sock, seer.jid, text)) failed.push(seer.jid)
    }

    if (doctor) {
        const text =
            `🌙 *Night ${game.day}: Doctor*\n\n` +
            `Protect one player:\n${formatTargetList(alivePlayers(game))}\n\n` +
            `Reply here with *${config.prefix}werewolf protect <number>* or *${config.prefix}werewolf skip*`
        if (!await safePrivate(sock, doctor.jid, text)) failed.push(doctor.jid)
    }

    if (failed.length) {
        await sock.sendMessage(game.groupId, {
            text: `⚠️ I could not PM night instructions to: ${failed.map(mention).join(', ')}`,
            mentions: failed
        })
    }
}

async function maybeResolveNight(sock, game) {
    if (game.phase !== 'night') return

    const wolves = aliveByRole(game, 'werewolf')
    const seer = aliveByRole(game, 'seer')[0]
    const doctor = aliveByRole(game, 'doctor')[0]
    const allWolvesActed = wolves.length > 0 && wolves.every(wolf => game.nightActions.kills[wolf.jid])
    const seerActed = !seer || Object.prototype.hasOwnProperty.call(game.nightActions, 'see')
    const doctorActed = !doctor || Object.prototype.hasOwnProperty.call(game.nightActions, 'protect')

    if (allWolvesActed && seerActed && doctorActed) {
        await resolveNight(sock, game)
    }
}

async function resolveNight(sock, game) {
    if (game.phase !== 'night') return

    const victim = chooseWolfVictim(game)
    const protectedTarget = game.nightActions.protect?.target
    let announcement

    if (victim && victim.jid !== protectedTarget) {
        game.alive[victim.jid] = false
        announcement =
            `☀️ *Morning ${game.day}*\n\n` +
            `${mention(victim.jid)} was eliminated during the night.\n` +
            `Their role was *${ROLE_NAMES[game.roles[victim.jid]]}*.`
    } else if (victim && victim.jid === protectedTarget) {
        announcement =
            `☀️ *Morning ${game.day}*\n\n` +
            `Someone was attacked, but the doctor saved them. Nobody died.`
    } else {
        announcement =
            `☀️ *Morning ${game.day}*\n\n` +
            `The night ended quietly. Nobody died.`
    }

    await sock.sendMessage(game.groupId, {
        text: announcement,
        mentions: victim ? [victim.jid] : []
    })

    if (await finishIfWon(sock, game)) return

    game.phase = 'day'
    game.votes = {}
    game.nightActions = {}

    await sock.sendMessage(game.groupId, {
        text:
            `🗣️ *Day ${game.day} Discussion*\n\n` +
            `${formatAliveList(game)}\n\n` +
            `Vote with *${config.prefix}werewolf vote @user* or *${config.prefix}werewolf vote <number>*.\n` +
            `Majority needed: *${majorityNeeded(game)}*.`,
        mentions: alivePlayers(game).map(p => p.jid)
    })
}

async function eliminateByVote(sock, game, player) {
    game.alive[player.jid] = false

    await sock.sendMessage(game.groupId, {
        text:
            `⚖️ The village eliminated ${mention(player.jid)}.\n` +
            `Their role was *${ROLE_NAMES[game.roles[player.jid]]}*.`,
        mentions: [player.jid]
    })

    if (await finishIfWon(sock, game)) return
    await startNight(sock, game)
}

async function startNight(sock, game) {
    game.phase = 'night'
    game.day += 1
    game.votes = {}
    game.nightActions = { kills: {} }

    await sock.sendMessage(game.groupId, {
        text: `🌙 *Night ${game.day} begins.* Living special roles, check your PM.`
    })
    await sendNightPrompts(sock, game)
}

async function finishIfWon(sock, game) {
    const winner = getWinner(game)
    if (!winner) return false

    const title = winner === 'werewolves' ? 'Werewolves win!' : 'Villagers win!'
    const roles = game.players.map(player => {
        const life = game.alive[player.jid] ? 'alive' : 'dead'
        return `${mention(player.jid)} - ${ROLE_NAMES[game.roles[player.jid]]} (${life})`
    })

    await sock.sendMessage(game.groupId, {
        text: `🏁 *${title}*\n\n*Final roles:*\n${roles.join('\n')}`,
        mentions: game.players.map(p => p.jid)
    })

    cleanupGame(game)
    return true
}

function assignRoles(game) {
    const playerCount = game.players.length
    const wolfCount = Math.max(1, Math.floor(playerCount / 4))
    const roles = [
        ...Array(wolfCount).fill('werewolf'),
        'seer'
    ]

    if (playerCount >= 5) roles.push('doctor')
    while (roles.length < playerCount) roles.push('villager')

    const shuffledPlayers = shuffle([...game.players])
    const shuffledRoles = shuffle(roles)

    for (let i = 0; i < shuffledPlayers.length; i++) {
        const player = shuffledPlayers[i]
        game.roles[player.jid] = shuffledRoles[i]
        game.alive[player.jid] = true
    }
}

function roleMessage(game, player) {
    const role = game.roles[player.jid]
    const wolfInfo = role === 'werewolf'
        ? `\n\nYour pack: ${aliveByRole(game, 'werewolf').map(displayName).join(', ')}`
        : ''

    return (
        `🐺 *Werewolf Role*\n\n` +
        `Group: ${game.groupId}\n` +
        `Your role: *${ROLE_NAMES[role]}*\n\n` +
        `${ROLE_HELP[role]}${wolfInfo}\n\n` +
        `Use *${config.prefix}werewolf status* any time to check the game.`
    )
}

function chooseWolfVictim(game) {
    const votes = Object.values(game.nightActions.kills || {})
    if (!votes.length) return null

    const counts = new Map()
    for (const target of votes) counts.set(target, (counts.get(target) || 0) + 1)
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
    if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return null
    return findPlayer(game, sorted[0][0])
}

function getWinner(game) {
    const alive = alivePlayers(game)
    const wolves = alive.filter(player => game.roles[player.jid] === 'werewolf').length
    const others = alive.length - wolves

    if (wolves === 0) return 'villagers'
    if (wolves >= others) return 'werewolves'
    return null
}

function getVoteTally(game) {
    const tally = new Map()
    for (const [voter, target] of Object.entries(game.votes)) {
        if (!isAlive(game, voter) || !isAlive(game, target)) continue
        if (!tally.has(target)) tally.set(target, [])
        tally.get(target).push(voter)
    }
    return tally
}

function majorityNeeded(game) {
    return Math.floor(alivePlayers(game).length / 2) + 1
}

function resolveTarget(ctx, game, text, candidates) {
    const mentions = getMentions(ctx.msg)
    for (const jid of mentions) {
        const player = candidates.find(candidate => sameJid(candidate.jid, jid))
        if (player) return { player }
    }

    const trimmed = String(text || '').trim()
    if (!trimmed) {
        return {
            error: `❌ Choose a target by mention or number:\n${formatTargetList(candidates)}`
        }
    }

    if (/^\d+$/.test(trimmed)) {
        const index = Number(trimmed) - 1
        if (candidates[index]) return { player: candidates[index] }
    }

    const lower = trimmed.toLowerCase()
    const digits = lower.replace(/\D/g, '')
    const player = candidates.find(candidate =>
        displayName(candidate).toLowerCase().includes(lower) ||
        (digits && normalizeJid(candidate.jid)?.includes(digits))
    )

    if (player) return { player }
    return { error: `❌ Target not found.\n${formatTargetList(candidates)}` }
}

function getContextGame(ctx) {
    if (ctx.isGroup) return games.get(ctx.from)
    const groupId = getPlayerGroup(ctx.sender)
    return groupId ? games.get(groupId) : null
}

async function canControlGame(ctx, game) {
    if (ctx.isOwner || sameJid(ctx.sender, game.host)) return true
    try {
        return await isAdmin(ctx.sock, game.groupId, ctx.sender)
    } catch {
        return false
    }
}

function cleanupGame(game) {
    games.delete(game.groupId)
    for (const player of game.players) deletePlayerGroup(player.jid)
}

function makePlayer(jid, name) {
    return {
        jid,
        name: name || normalizeJid(jid)
    }
}

function findPlayer(game, jid) {
    return game.players.find(player => sameJid(player.jid, jid))
}

function isPlayerBusy(jid, currentGroupId) {
    const groupId = getPlayerGroup(jid)
    return Boolean(groupId && groupId !== currentGroupId && games.has(groupId))
}

function setPlayerGroup(jid, groupId) {
    playerGroups.set(normalizeJid(jid), groupId)
}

function getPlayerGroup(jid) {
    return playerGroups.get(normalizeJid(jid))
}

function deletePlayerGroup(jid) {
    playerGroups.delete(normalizeJid(jid))
}

function sameJid(a, b) {
    return normalizeJid(a) === normalizeJid(b)
}

function isAlive(game, jid) {
    const player = findPlayer(game, jid)
    return Boolean(player && game.alive[player.jid])
}

function alivePlayers(game) {
    return game.players.filter(player => game.alive[player.jid])
}

function aliveByRole(game, role) {
    return alivePlayers(game).filter(player => game.roles[player.jid] === role)
}

function formatAliveList(game) {
    return formatTargetList(alivePlayers(game), true)
}

function formatTargetList(players, withMentions = false) {
    if (!players.length) return '_No available targets._'
    return players.map((player, index) => {
        const name = withMentions ? mention(player.jid) : displayName(player)
        return `${index + 1}. ${name}`
    }).join('\n')
}

function displayName(player) {
    return player.name || normalizeJid(player.jid)
}

function mention(jid) {
    return `@${normalizeJid(jid)}`
}

function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items
}

async function safePrivate(sock, jid, text) {
    try {
        await sock.sendMessage(jid, { text })
        return true
    } catch (err) {
        console.error('[WEREWOLF DM ERROR]', jid, err.message)
        return false
    }
}

async function reply(ctx, text, mentions = []) {
    await ctx.sock.sendMessage(ctx.from, { text, mentions }, { quoted: ctx.msg })
}
