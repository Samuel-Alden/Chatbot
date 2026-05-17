const config = require('../config')
const { normalizeJid } = require('../utils/helper')
const { phoneOf } = require('../utils/jids')
const economy = require('./economy')

const REWARD = 50
const PLAY_COST = 25
const TIME_LIMIT_MS = 90_000
const START_COOLDOWN_MS = 15_000

// Curated K-pop tracks. Hint is a non-lyric factual clue so we don't
// pull in copyrighted lyrics. Add more here freely.
const SONGS = [
    { title: 'Dynamite', artist: 'BTS', year: 2020, hint: 'Lagu Inggris pertama BTS yang nomor 1 di Billboard Hot 100.' },
    { title: 'Butter', artist: 'BTS', year: 2021, hint: 'Summer single BTS dengan tema mentega meleleh.' },
    { title: 'Boy With Luv', artist: 'BTS', year: 2019, hint: 'Kolaborasi BTS dengan Halsey.' },
    { title: 'Fake Love', artist: 'BTS', year: 2018, hint: 'Title track album Love Yourself: Tear.' },
    { title: 'How You Like That', artist: 'BLACKPINK', year: 2020, hint: 'Pre-release single album pertama BLACKPINK.' },
    { title: 'DDU-DU DDU-DU', artist: 'BLACKPINK', year: 2018, hint: 'Lagu BLACKPINK dengan efek suara letupan ikonik di chorus.' },
    { title: 'Kill This Love', artist: 'BLACKPINK', year: 2019, hint: 'BLACKPINK dengan intro brass yang ikonik.' },
    { title: 'Pink Venom', artist: 'BLACKPINK', year: 2022, hint: 'Pre-release single album Born Pink.' },
    { title: 'Attention', artist: 'NewJeans', year: 2022, hint: 'Lagu debut NewJeans.' },
    { title: 'Ditto', artist: 'NewJeans', year: 2022, hint: 'NewJeans dengan music video bertema 90-an dan camcorder.' },
    { title: 'Super Shy', artist: 'NewJeans', year: 2023, hint: 'NewJeans tentang perasaan malu pada crush, summer hit 2023.' },
    { title: 'OMG', artist: 'NewJeans', year: 2023, hint: 'NewJeans dengan music video bertema rumah sakit jiwa.' },
    { title: 'Love Dive', artist: 'IVE', year: 2022, hint: 'IVE dengan choreography finger heart di chorus.' },
    { title: 'After LIKE', artist: 'IVE', year: 2022, hint: 'IVE yang sampling lagu disco Anita Ward.' },
    { title: 'I AM', artist: 'IVE', year: 2023, hint: 'Title track album I\'ve IVE.' },
    { title: 'FEARLESS', artist: 'LE SSERAFIM', year: 2022, hint: 'Lagu debut LE SSERAFIM.' },
    { title: 'ANTIFRAGILE', artist: 'LE SSERAFIM', year: 2022, hint: 'LE SSERAFIM dengan rap berbahasa Spanyol di intro.' },
    { title: 'UNFORGIVEN', artist: 'LE SSERAFIM', year: 2023, hint: 'Kolaborasi LE SSERAFIM dengan legenda disco Nile Rodgers.' },
    { title: 'TT', artist: 'TWICE', year: 2016, hint: 'TWICE dengan tarian membentuk huruf di pipi.' },
    { title: 'What is Love?', artist: 'TWICE', year: 2018, hint: 'TWICE dengan music video parodi film romance Hollywood.' },
    { title: 'Cheer Up', artist: 'TWICE', year: 2016, hint: 'TWICE dengan baris terkenal "shy shy shy".' },
    { title: 'Next Level', artist: 'aespa', year: 2021, hint: 'aespa yang berasal dari soundtrack film Fast & Furious.' },
    { title: 'Spicy', artist: 'aespa', year: 2023, hint: 'aespa dengan tema kuliner pedas di music videonya.' },
    { title: 'Supernova', artist: 'aespa', year: 2024, hint: 'Lead single album Armageddon aespa.' },
    { title: 'God\'s Menu', artist: 'Stray Kids', year: 2020, hint: 'Stray Kids dengan referensi memasak dan koki.' },
    { title: 'MANIAC', artist: 'Stray Kids', year: 2022, hint: 'Title track album ODDINARY.' },
    { title: 'S-Class', artist: 'Stray Kids', year: 2023, hint: 'Title track album 5-STAR Stray Kids.' },
    { title: 'Growl', artist: 'EXO', year: 2013, hint: 'EXO dengan koreografi one-take yang ikonik di awal kariernya.' },
    { title: 'Love Shot', artist: 'EXO', year: 2018, hint: 'EXO dengan tema klub malam dan setelan hitam.' },
    { title: 'Cherry Bomb', artist: 'NCT 127', year: 2017, hint: 'NCT 127 dengan baris "꼬마야".' },
    { title: 'Psycho', artist: 'Red Velvet', year: 2019, hint: 'Red Velvet dari The ReVe Festival: Finale.' },
    { title: 'Wannabe', artist: 'ITZY', year: 2020, hint: 'ITZY dengan baris "I wanna be me me me".' },
    { title: 'Gee', artist: 'Girls\' Generation', year: 2009, hint: 'Mega hit SNSD 2009 dengan music video bertema mannequin.' },
    { title: 'Gangnam Style', artist: 'PSY', year: 2012, hint: 'Lagu Korea pertama yang menembus 1 milyar views di YouTube.' },
    { title: 'Bang Bang Bang', artist: 'BIGBANG', year: 2015, hint: 'Anthem konser BIGBANG dengan judul tiga kata berulang.' },
    { title: 'Hype Boy', artist: 'NewJeans', year: 2022, hint: 'NewJeans dengan MV versi berbeda untuk tiap member.' },
    { title: 'ETA', artist: 'NewJeans', year: 2023, hint: 'NewJeans dengan music video yang direkam memakai iPhone.' },
    { title: 'ASAP', artist: 'NewJeans', year: 2023, hint: 'Lagu dreamy NewJeans dengan teaser para peri.' },
    { title: 'Magnetic', artist: 'ILLIT', year: 2024, hint: 'Debut viral ILLIT dengan chorus catchy dan gerakan tangan ikonik.' },
    { title: 'Lucky Girl Syndrome', artist: 'ILLIT', year: 2024, hint: 'B-side populer ILLIT tentang manifestasi keberuntungan.' },
    { title: 'Drama', artist: 'aespa', year: 2023, hint: 'aespa dengan intro “Ya ya I’m the drama”.' },
    { title: 'Armageddon', artist: 'aespa', year: 2024, hint: 'Title track futuristik dari full album pertama aespa.' },
    { title: 'Black Mamba', artist: 'aespa', year: 2020, hint: 'Lagu debut aespa dengan villain AI bernama Black Mamba.' },
    { title: 'Cupid', artist: 'FIFTY FIFTY', year: 2023, hint: 'Lagu viral TikTok dengan versi Twin yang populer global.' },
    { title: 'Perfect Night', artist: 'LE SSERAFIM', year: 2023, hint: 'Kolaborasi LE SSERAFIM dengan game Overwatch 2.' },
    { title: 'EASY', artist: 'LE SSERAFIM', year: 2024, hint: 'LE SSERAFIM dengan konsep santai namun koreografi sulit.' },
    { title: 'LOVE SCENARIO', artist: 'iKON', year: 2018, hint: 'Lagu iKON yang sangat populer di kalangan anak-anak Korea.' },
    { title: 'Bboom Bboom', artist: 'MOMOLAND', year: 2018, hint: 'Hit viral MOMOLAND dengan dance sederhana dan catchy.' },
    { title: 'Miroh', artist: 'Stray Kids', year: 2019, hint: 'Stray Kids dengan chant “Stray Kids woo!”.' },
    { title: 'Back Door', artist: 'Stray Kids', year: 2020, hint: 'Stray Kids mengajak pendengar masuk ke pesta rahasia.' },
    { title: '0X1=LOVESONG', artist: 'TXT', year: 2021, hint: 'TXT featuring Seori dengan nuansa pop rock emosional.' },
    { title: 'Sugar Rush Ride', artist: 'TXT', year: 2023, hint: 'TXT dengan konsep fantasi dan chorus adiktif.' },
    { title: 'BOUNCY', artist: 'ATEEZ', year: 2023, hint: 'ATEEZ dengan baris “Slow it down make it bouncy”.' },
    { title: 'Crazy Form', artist: 'ATEEZ', year: 2023, hint: 'ATEEZ dengan konsep rebel dan energi tinggi.' },
    { title: 'Lucifer', artist: 'SHINee', year: 2010, hint: 'SHINee dengan choreography legendaris dan synth ikonik.' },
    { title: 'Replay', artist: 'SHINee', year: 2008, hint: 'Lagu debut SHINee dengan kata “noona” yang terkenal.' },
    { title: 'Fantastic Baby', artist: 'BIGBANG', year: 2012, hint: 'BIGBANG dengan teriakan “Wow fantastic baby!”.' },
    { title: 'Loser', artist: 'BIGBANG', year: 2015, hint: 'BIGBANG dengan konsep lebih emosional dan melankolis.' },
    { title: 'Ring Ding Dong', artist: 'SHINee', year: 2009, hint: 'Lagu SHINee yang terkenal terlalu catchy saat musim ujian.' },
    { title: 'Hot', artist: 'SEVENTEEN', year: 2022, hint: 'SEVENTEEN dengan konsep koboi dan gurun.' },
    { title: 'Super', artist: 'SEVENTEEN', year: 2023, hint: 'SEVENTEEN terinspirasi dari Sun Wukong atau Raja Kera.' },
    { title: 'Very Nice', artist: 'SEVENTEEN', year: 2016, hint: 'Lagu SEVENTEEN yang sering diputar ulang berkali-kali di konser.' },
    { title: 'Bite Me', artist: 'ENHYPEN', year: 2023, hint: 'ENHYPEN dengan konsep vampir romantis.' },
    { title: 'Drunk-Dazed', artist: 'ENHYPEN', year: 2021, hint: 'ENHYPEN dengan suasana pesta chaotic dan vampir.' },
    { title: 'Earth, Wind & Fire', artist: 'BOYNEXTDOOR', year: 2024, hint: 'BOYNEXTDOOR dengan energi playful dan chorus eksplosif.' },
    { title: 'One and Only', artist: 'BOYNEXTDOOR', year: 2023, hint: 'Debut BOYNEXTDOOR dengan vibe fresh dan youthful.' },
    { title: 'Queencard', artist: '(G)I-DLE', year: 2023, hint: 'Lagu percaya diri (G)I-DLE dengan konsep komedi remaja.' },
    { title: 'TOMBOY', artist: '(G)I-DLE', year: 2022, hint: '(G)I-DLE dengan lirik “I’m not a doll”.' },
    { title: 'Maria', artist: 'Hwasa', year: 2020, hint: 'Solo hit Hwasa dengan pesan tentang kritik dan self-love.' },
    { title: 'Rover', artist: 'Kai', year: 2023, hint: 'Kai EXO dengan dance point berjalan santai.' },
    { title: 'Like Crazy', artist: 'Jimin', year: 2023, hint: 'Solo Jimin BTS yang terinspirasi film dengan judul sama.' },
    { title: 'Seven', artist: 'Jungkook', year: 2023, hint: 'Solo Jungkook featuring Latto tentang tujuh hari seminggu.' },
    { title: 'Flower', artist: 'Jisoo', year: 2023, hint: 'Solo debut Jisoo BLACKPINK dengan dance tangan seperti bunga.' },
    { title: 'POP!', artist: 'Nayeon', year: 2022, hint: 'Solo debut Nayeon TWICE dengan chorus cerah dan catchy.' },
    { title: 'Whiplash', artist: 'aespa', year: 2024, hint: 'aespa dengan konsep cyber dan chorus “whiplash”.' },
    { title: 'UP', artist: 'Karina', year: 2025, hint: 'Solo Karina aespa yang viral dengan performance powerful.' },
    { title: 'Jump', artist: 'BLACKPINK', year: 2025, hint: 'Comeback BLACKPINK setelah hiatus grup panjang.' },
    { title: 'Deadline', artist: 'BLACKPINK', year: 2026, hint: 'Mini album comeback BLACKPINK tahun 2026.' },
    { title: 'Swim', artist: 'BTS', year: 2026, hint: 'Title track comeback BTS setelah era wajib militer.' },
    { title: 'Body to Body', artist: 'BTS', year: 2026, hint: 'B-side BTS dari comeback album 2026.' },
    { title: 'ATTITUDE', artist: 'aespa', year: 2026, hint: 'Single aespa yang juga dipakai untuk anime Kill Blue.' },
    { title: 'EASY', artist: 'LE SSERAFIM', year: 2024, hint: 'LE SSERAFIM dengan konsep effortless namun intense.' },
    { title: 'Smart', artist: 'LE SSERAFIM', year: 2024, hint: 'B-side LE SSERAFIM dengan vibe Afrobeat.' },
    { title: 'CRAZY', artist: 'LE SSERAFIM', year: 2025, hint: 'LE SSERAFIM dengan konsep party dan EDM energik.' },
    { title: 'Supernatural', artist: 'NewJeans', year: 2024, hint: 'Single Jepang NewJeans dengan vibe city pop.' },
    { title: 'Right Now', artist: 'NewJeans', year: 2024, hint: 'Coupling song Jepang NewJeans dari single Supernatural.' },
    { title: 'HEYA', artist: 'IVE', year: 2024, hint: 'IVE dengan konsep oriental modern dan visual elegan.' },
    { title: 'Accendio', artist: 'IVE', year: 2024, hint: 'IVE dengan konsep sihir dan fantasy vibes.' },
    { title: 'Chk Chk Boom', artist: 'Stray Kids', year: 2024, hint: 'Stray Kids dengan vibe Latin dan chorus eksplosif.' },
    { title: 'Walkin On Water', artist: 'Stray Kids', year: 2025, hint: 'Track Stray Kids dengan tema percaya diri dan dominasi.' },
    { title: 'SHEESH', artist: 'BABYMONSTER', year: 2024, hint: 'BABYMONSTER dengan line terkenal “B-A-B-Y-M-O-N”.' },
    { title: 'FOREVER', artist: 'BABYMONSTER', year: 2024, hint: 'Digital single BABYMONSTER dengan vibe musim panas.' },
    { title: 'DRIP', artist: 'BABYMONSTER', year: 2025, hint: 'BABYMONSTER dengan konsep hip-hop swag.' },
    { title: 'Nice Guy', artist: 'BOYNEXTDOOR', year: 2025, hint: 'BOYNEXTDOOR dengan konsep cowok baik tapi usil.' },
    { title: 'Love 119', artist: 'RIIZE', year: 2024, hint: 'RIIZE yang sampling lagu lawas iZi.' },
    { title: 'Impossible', artist: 'RIIZE', year: 2024, hint: 'RIIZE dengan konsep youth dan friendship.' },
    { title: 'Boom Boom Bass', artist: 'RIIZE', year: 2024, hint: 'RIIZE dengan vibe funky dan bass line catchy.' },
    { title: 'Deja Vu', artist: 'TXT', year: 2024, hint: 'TXT dengan nuansa emosional dan fantasy.' },
    { title: 'Over The Moon', artist: 'TXT', year: 2025, hint: 'TXT dengan konsep dreamy pop rock.' },
    { title: 'Fatal Trouble', artist: 'ENHYPEN', year: 2024, hint: 'ENHYPEN dengan konsep dark dan vampir.' },
    { title: 'XO (Only If You Say Yes)', artist: 'ENHYPEN', year: 2024, hint: 'ENHYPEN dengan vibe lebih bright dan romantic.' },
    { title: 'ABCD', artist: 'Nayeon', year: 2024, hint: 'Solo Nayeon dengan konsep pop diva retro.' },
    { title: 'Mantra', artist: 'Jennie', year: 2025, hint: 'Solo Jennie BLACKPINK dengan konsep confident dan stylish.' },
    { title: 'APT.', artist: 'ROSÉ', year: 2024, hint: 'Kolaborasi ROSÉ BLACKPINK dengan Bruno Mars.' },
    { title: 'Like Jennie', artist: 'Jennie', year: 2025, hint: 'Solo Jennie dengan title yang memakai namanya sendiri.' }
]

const games = new Map()
const startCooldowns = new Map()

setInterval(() => {
    const now = Date.now()
    for (const [chatId, availableAt] of startCooldowns) {
        if (availableAt <= now) startCooldowns.delete(chatId)
    }
}, 60_000).unref()

function normalize(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function maskTitle(title) {
    return title
        .split(/(\s+)/)
        .map(part => {
            if (/^\s+$/.test(part)) return part
            if (part.length <= 1) return part
            return part[0] + '_'.repeat(part.length - 1)
        })
        .join('')
}

async function endGame(chatId) {
    const game = games.get(chatId)
    if (!game) return null
    if (game.timeoutId) clearTimeout(game.timeoutId)
    games.delete(chatId)
    return game
}

function remainingStartCooldown(chatId) {
    const availableAt = startCooldowns.get(chatId) || 0
    const remaining = availableAt - Date.now()
    if (remaining <= 0) {
        startCooldowns.delete(chatId)
        return 0
    }
    return remaining
}

module.exports = {
    start: async (ctx) => {
        const sub = (ctx.args[0] || '').toLowerCase()
        if (sub === 'stop' || sub === 'end' || sub === 'nyerah') {
            const game = await endGame(ctx.from)
            if (!game) {
                return ctx.sock.sendMessage(ctx.from, {
                    text: '❌ Tidak ada game tebak lagu yang sedang berjalan.'
                }, { quoted: ctx.msg })
            }
            return ctx.sock.sendMessage(ctx.from, {
                text: `🛑 Game dihentikan.\nJawabannya: *${game.song.title}* — ${game.song.artist} (${game.song.year}).`
            }, { quoted: ctx.msg })
        }

        if (games.has(ctx.from)) {
            return ctx.sock.sendMessage(ctx.from, {
                text: '⏳ Sudah ada game tebak lagu yang berjalan di chat ini. Tunggu selesai atau ketik *!tebaklagukpop stop*.'
            }, { quoted: ctx.msg })
        }

        const cooldownRemaining = remainingStartCooldown(ctx.from)
        if (cooldownRemaining > 0) {
            return ctx.sock.sendMessage(ctx.from, {
                text: `⏳ Tunggu *${Math.ceil(cooldownRemaining / 1000)} detik* sebelum memulai game Tebak Lagu K-pop lagi.`
            }, { quoted: ctx.msg })
        }

        const charge = economy.charge(ctx, PLAY_COST)
        if (!charge.ok) {
            return ctx.sock.sendMessage(ctx.from, {
                text: `❌ Memulai *${config.prefix}tebaklagukpop* butuh *${PLAY_COST} koin*, tapi saldo kamu cuma *${charge.balance} koin*.\nCari koin dulu lewat *${config.prefix}daily* atau *${config.prefix}work*.`
            }, { quoted: ctx.msg })
        }

        const song = SONGS[Math.floor(Math.random() * SONGS.length)]
        const game = { song, startedAt: Date.now(), timeoutId: null }
        games.set(ctx.from, game)
        startCooldowns.set(ctx.from, Date.now() + START_COOLDOWN_MS)

        game.timeoutId = setTimeout(async () => {
            const current = games.get(ctx.from)
            if (!current || current !== game) return
            games.delete(ctx.from)
            try {
                await ctx.sock.sendMessage(ctx.from, {
                    text: `⏰ Waktu habis!\nJawabannya: *${song.title}* — ${song.artist} (${song.year}).`
                })
            } catch (err) {
                console.error('[tebaklagukpop] timeout reply failed:', err.message)
            }
        }, TIME_LIMIT_MS)

        try {
            await ctx.sock.sendMessage(ctx.from, {
                text:
                    `🎵 *Tebak Lagu K-pop!*\n\n` +
                    `🎤 Artis: *${song.artist}*\n` +
                    `📅 Tahun: *${song.year}*\n` +
                    `🔤 Judul: \`${maskTitle(song.title)}\` (${song.title.replace(/\s/g, '').length} huruf)\n` +
                    `💡 Petunjuk: ${song.hint}\n\n` +
                    `💸 Biaya main: *${PLAY_COST} koin*\n` +
                    `🏆 Hadiah: *${REWARD} koin*\n` +
                    `⏱️ Waktu: ${TIME_LIMIT_MS / 1000} detik.\n\n` +
                    `Ketik jawaban di chat.`
            }, { quoted: ctx.msg })
        } catch (err) {
            await endGame(ctx.from)
            startCooldowns.delete(ctx.from)
            if (charge.charged > 0) economy.refund(ctx, charge.charged)
            throw err
        }
    },

    // Called from index.js for every incoming non-command message.
    // Returns true if it consumed the message (correct guess), false otherwise.
    checkGuess: async ({ sock, msg, from, sender, body }) => {
        const game = games.get(from)
        if (!game) return false
        if (normalize(body) !== normalize(game.song.title)) return false

        await endGame(from)

        const isGroup = from.endsWith('@g.us')
        const senderNumber = normalizeJid(sender).replace(/\D/g, '')
        const ownerDigits = String(config.ownerNumber || '').replace(/\D/g, '')
        const isOwner = Boolean(ownerDigits) && senderNumber === ownerDigits

        const fakeCtx = { from, sender, senderNumber, isGroup, isOwner }
        const reward = economy.reward(fakeCtx, REWARD)

        const pn = await phoneOf(sock, sender, isGroup ? from : null)
        const scopeLabel = isGroup ? 'grup ini' : 'wallet pribadimu'
        const coinLine = reward.credited > 0
            ? `💰 +${reward.credited} koin di ${scopeLabel} (saldo: ${reward.balance}).`
            : ''

        await sock.sendMessage(from, {
            text:
                `🎉 *Benar!* @${pn.split('@')[0]} berhasil menebak!\n\n` +
                `Jawaban: *${game.song.title}* — ${game.song.artist} (${game.song.year}).` +
                (coinLine ? `\n${coinLine}` : ''),
            mentions: [pn]
        }, { quoted: msg })

        return true
    }
}
