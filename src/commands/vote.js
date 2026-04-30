const { normalizeJid, isAdmin } = require('../utils/helper')

const VOTE_TTL_MS = 24 * 60 * 60 * 1000 // votes auto-expire after 24h
const activeVotes = {}

function isExpired(vote) {
    return Date.now() - vote.startTime > VOTE_TTL_MS
}

function buildResults(vote) {
    const totalVotes = vote.votes.reduce((a, b) => a + b, 0)
    const lines = vote.options.map((opt, i) => {
        const count = vote.votes[i]
        const percent = totalVotes ? Math.round((count / totalVotes) * 100) : 0
        const filled = Math.floor(percent / 10)
        const bar = '█'.repeat(filled) + '░'.repeat(10 - filled)
        return `${i + 1}. *${opt}*\n   ${bar} ${count} votes (${percent}%)`
    }).join('\n\n')
    return { totalVotes, lines }
}

async function startNewVote({ sock, from, msg, sender, text }) {
    if (!text) return sock.sendMessage(from, {
        text: '❌ Usage: *!vote question | option1 | option2 | ...*\nExample: *!vote Favorite color? | Red | Blue | Green*'
    }, { quoted: msg })

    const parts = text.split('|').map(p => p.trim()).filter(Boolean)
    if (parts.length < 3) return sock.sendMessage(from, {
        text: '❌ Please provide at least 2 options!\nExample: *!vote Favorite color? | Red | Blue | Green*'
    }, { quoted: msg })

    const [question, ...options] = parts
    activeVotes[from] = {
        question,
        options,
        votes: new Array(options.length).fill(0),
        voters: {},
        creator: normalizeJid(sender),
        startTime: Date.now()
    }

    const optionList = options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')
    await sock.sendMessage(from, {
        text: `📊 *VOTE STARTED!*\n\n❓ *${question}*\n\n${optionList}\n\nType *!vote [number]* to vote!\nType *!voteresult* to see results.\nType *!votestop* to end the vote.`
    }, { quoted: msg })
}

module.exports = {
    vote: async (ctx) => {
        const { sock, from, msg, isGroup, sender, text, args } = ctx
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })

        // Auto-expire stale votes
        if (activeVotes[from] && isExpired(activeVotes[from])) {
            delete activeVotes[from]
        }

        // Explicit "!vote new ..." always starts a fresh vote (replacing any active one)
        if (args[0]?.toLowerCase() === 'new') {
            const rest = args.slice(1).join(' ')
            if (activeVotes[from]) delete activeVotes[from]
            return startNewVote({ ...ctx, text: rest })
        }

        // If there's an active vote, register the user's vote
        if (activeVotes[from]) {
            const vote = activeVotes[from]
            const choice = parseInt(text, 10)

            if (!Number.isInteger(choice) || choice < 1 || choice > vote.options.length) {
                return sock.sendMessage(from, {
                    text: `❌ Please choose a valid option (1-${vote.options.length})!\n\nType *!vote [number]* to vote, or *!vote new question | a | b* to start a new poll.`
                }, { quoted: msg })
            }

            const senderNum = normalizeJid(sender)
            if (vote.voters[senderNum]) {
                return sock.sendMessage(from, { text: '❌ You have already voted!' }, { quoted: msg })
            }

            vote.voters[senderNum] = choice
            vote.votes[choice - 1]++

            await sock.sendMessage(from, {
                text: `✅ Your vote for *${vote.options[choice - 1]}* has been recorded!`
            }, { quoted: msg })
            return
        }

        // No active vote → treat as a new vote creation
        return startNewVote(ctx)
    },

    voteResult: async ({ sock, from, msg, isGroup }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!activeVotes[from]) return sock.sendMessage(from, { text: '❌ No active vote in this group!' }, { quoted: msg })

        const vote = activeVotes[from]
        const { totalVotes, lines } = buildResults(vote)
        await sock.sendMessage(from, {
            text: `📊 *VOTE RESULTS*\n\n❓ *${vote.question}*\n\n${lines}\n\n👥 Total votes: ${totalVotes}`
        }, { quoted: msg })
    },

    voteStop: async ({ sock, from, msg, isGroup, sender }) => {
        if (!isGroup) return sock.sendMessage(from, { text: '❌ This command is for groups only!' }, { quoted: msg })
        if (!activeVotes[from]) return sock.sendMessage(from, { text: '❌ No active vote in this group!' }, { quoted: msg })

        const vote = activeVotes[from]
        const senderNum = normalizeJid(sender)

        if (vote.creator !== senderNum && !await isAdmin(sock, from, sender)) {
            return sock.sendMessage(from, { text: '❌ Only the vote creator or an admin can stop the vote!' }, { quoted: msg })
        }

        const { totalVotes, lines } = buildResults(vote)
        const maxVotes = Math.max(...vote.votes)
        const winner = maxVotes === 0 ? 'No votes cast' : vote.options[vote.votes.indexOf(maxVotes)]

        delete activeVotes[from]

        await sock.sendMessage(from, {
            text: `📊 *VOTE ENDED!*\n\n❓ *${vote.question}*\n\n${lines}\n\n👥 Total votes: ${totalVotes}\n🏆 Winner: *${winner}*`
        }, { quoted: msg })
    }
}
