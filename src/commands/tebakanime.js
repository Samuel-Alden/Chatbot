const config = require('../config')
const { normalizeJid } = require('../utils/helper')
const { phoneOf } = require('../utils/jids')
const economy = require('./economy')

const REWARD = 50
const PLAY_COST = 25
const TIME_LIMIT_MS = 90_000
const START_COOLDOWN_MS = 15_000

const ANIME = [
    { title: 'Naruto', year: 2002, hint: 'Anime ninja dengan tokoh utama yang bercita-cita menjadi Hokage.' },
    { title: 'One Piece', year: 1999, hint: 'Petualangan bajak laut mencari harta karun legendaris bersama kru Topi Jerami.' },
    { title: 'Bleach', year: 2004, hint: 'Remaja yang menjadi Shinigami pengganti dan memakai zanpakuto.' },
    { title: 'Attack on Titan', year: 2013, hint: 'Manusia bertahan hidup di balik tembok besar dari ancaman raksasa pemakan manusia.' },
    { title: 'Death Note', year: 2006, hint: 'Buku misterius yang bisa membunuh siapa pun jika namanya ditulis.' },
    { title: 'Fullmetal Alchemist: Brotherhood', year: 2009, hint: 'Dua saudara alkemis mencari Philosopher\'s Stone setelah eksperimen terlarang.' },
    { title: 'Demon Slayer', year: 2019, hint: 'Seorang kakak bertarung melawan iblis sambil mencari cara menyembuhkan adiknya.' },
    { title: 'Jujutsu Kaisen', year: 2020, hint: 'Siswa SMA terlibat dunia kutukan setelah menelan benda terlarang.' },
    { title: 'Chainsaw Man', year: 2022, hint: 'Pemburu iblis yang bisa berubah menggunakan mesin gergaji.' },
    { title: 'Hunter x Hunter', year: 2011, hint: 'Bocah petualang mengikuti ujian berbahaya untuk mencari ayahnya.' },
    { title: 'My Hero Academia', year: 2016, hint: 'Dunia tempat hampir semua orang punya kekuatan super yang disebut Quirk.' },
    { title: 'Spy x Family', year: 2022, hint: 'Keluarga palsu berisi mata-mata, pembunuh bayaran, dan anak telepati.' },
    { title: 'Tokyo Ghoul', year: 2014, hint: 'Mahasiswa berubah menjadi makhluk pemakan manusia setelah operasi transplantasi.' },
    { title: 'Haikyuu!!', year: 2014, hint: 'Anime voli SMA dengan duo setter dan spiker yang sangat enerjik.' },
    { title: 'Kuroko\'s Basketball', year: 2012, hint: 'Tim basket SMA dengan mantan anggota generasi pemain ajaib.' },
    { title: 'Blue Lock', year: 2022, hint: 'Program latihan striker sepak bola yang sangat egois dan kompetitif.' },
    { title: 'Steins;Gate', year: 2011, hint: 'Sekelompok teman tanpa sengaja menemukan cara mengirim pesan ke masa lalu.' },
    { title: 'Code Geass', year: 2006, hint: 'Pangeran terbuang mendapat kekuatan mutlak untuk memberi perintah yang tak bisa ditolak.' },
    { title: 'Neon Genesis Evangelion', year: 1995, hint: 'Remaja mengendalikan mecha untuk melawan makhluk bernama Angel.' },
    { title: 'Cowboy Bebop', year: 1998, hint: 'Pemburu hadiah luar angkasa dengan nuansa jazz yang sangat ikonik.' },
    { title: 'Sailor Moon', year: 1992, hint: 'Gadis sekolah berubah menjadi pejuang bulan bersama teman-temannya.' },
    { title: 'Cardcaptor Sakura', year: 1998, hint: 'Siswi SD mengumpulkan kartu sihir yang lepas dari buku misterius.' },
    { title: 'Dragon Ball Z', year: 1989, hint: 'Petarung Saiyan dewasa membela bumi dengan jurus Kamehameha.' },
    { title: 'Dragon Ball Super', year: 2015, hint: 'Lanjutan kisah petarung Saiyan dengan dewa kehancuran dan turnamen multisemesta.' },
    { title: 'JoJo\'s Bizarre Adventure', year: 2012, hint: 'Serial penuh pose dramatis dengan garis keturunan keluarga unik dan Stand.' },
    { title: 'Mob Psycho 100', year: 2016, hint: 'Anak pendiam berkekuatan esper luar biasa bekerja untuk mentor palsu.' },
    { title: 'One Punch Man', year: 2015, hint: 'Pahlawan botak yang bisa menang hanya dengan satu pukulan.' },
    { title: 'Re:Zero', year: 2016, hint: 'Pemuda terlempar ke dunia lain dan kembali ke titik tertentu setiap kali mati.' },
    { title: 'Sword Art Online', year: 2012, hint: 'Pemain game VR terjebak di dunia virtual dan mati sungguhan jika kalah.' },
    { title: 'No Game No Life', year: 2014, hint: 'Kakak-adik jenius game dipanggil ke dunia tempat semua konflik diselesaikan lewat permainan.' },
    { title: 'Your Lie in April', year: 2014, hint: 'Pianis muda yang kehilangan semangat bertemu pemain biola yang mengubah hidupnya.' },
    { title: 'Violet Evergarden', year: 2018, hint: 'Mantan tentara belajar memahami perasaan manusia lewat surat-surat.' },
    { title: 'Fruits Basket', year: 2019, hint: 'Siswi yatim tinggal bersama keluarga yang berubah sesuai zodiak Tiongkok.' },
    { title: 'Black Clover', year: 2017, hint: 'Pemuda tanpa sihir bertekad menjadi Kaisar Sihir.' },
    { title: 'Fairy Tail', year: 2009, hint: 'Guild penyihir yang terkenal kacau namun sangat solid.' },
    { title: 'The Promised Neverland', year: 2019, hint: 'Anak-anak panti asuhan menemukan rahasia mengerikan tentang rumah mereka.' },
    { title: 'Dr. Stone', year: 2019, hint: 'Peradaban dibangun ulang lewat sains setelah umat manusia membatu.' },
    { title: 'Fire Force', year: 2019, hint: 'Pasukan pemadam khusus melawan manusia yang terbakar spontan.' },
    { title: 'Noragami', year: 2014, hint: 'Dewa miskin menerima pekerjaan receh demi punya kuil sendiri.' },
    { title: 'Assassination Classroom', year: 2015, hint: 'Kelas murid ditugaskan membunuh guru gurita supercepat mereka.' },
    { title: 'Tokyo Revengers', year: 2021, hint: 'Pemuda kembali ke masa SMP untuk mengubah nasib geng dan orang yang ia cintai.' },
    { title: 'Bungo Stray Dogs', year: 2016, hint: 'Detektif dan mafia bertarung memakai kekuatan yang terinspirasi nama sastrawan.' },
    { title: 'Frieren: Beyond Journey\'s End', year: 2023, hint: 'Penyihir elf hidup sangat lama dan merenungi arti waktu setelah petualangan usai.' },
    { title: 'Oshi no Ko', year: 2023, hint: 'Drama industri hiburan dimulai dari kelahiran kembali anak-anak seorang idol.' },
    { title: 'Solo Leveling', year: 2024, hint: 'Hunter terlemah mendapat sistem misterius yang membuatnya bisa naik level sendiri.' },
    { title: 'Mashle: Magic and Muscles', year: 2023, hint: 'Anak tanpa sihir mengandalkan otot di sekolah sihir.' },
    { title: 'Wind Breaker', year: 2024, hint: 'Anak berandalan masuk sekolah yang melindungi kota lewat kekuatan tinju.' },
    { title: 'The Apothecary Diaries', year: 2023, hint: 'Gadis cerdas di istana kekaisaran memecahkan misteri dengan pengetahuan racun dan obat.' },
    { title: 'Delicious in Dungeon', year: 2024, hint: 'Party petualang memasak monster untuk bertahan hidup di dungeon.' },
    { title: 'Bocchi the Rock!', year: 2022, hint: 'Gadis pemalu menemukan tempatnya lewat band dan gitar.' },
    { title: 'Kaguya-sama: Love Is War', year: 2019, hint: 'Dua siswa jenius terlalu gengsi mengaku cinta lebih dulu.' },
    { title: 'Gintama', year: 2006, hint: 'Samurai pemalas hidup di Edo versi alien dengan humor absurd.' },
    { title: 'Toradora!', year: 2008, hint: 'Kisah komedi romantis dengan gadis kecil galak dan cowok berwajah seram.' },
    { title: 'Clannad', year: 2007, hint: 'Drama sekolah yang berkembang menjadi kisah keluarga yang sangat emosional.' },
    { title: 'Made in Abyss', year: 2017, hint: 'Petualangan turun ke jurang raksasa yang indah sekaligus mengerikan.' },
    { title: 'Parasyte -the maxim-', year: 2014, hint: 'Makhluk parasit gagal mengambil alih otak seorang siswa dan hidup di tangan kanannya.' }
]

const games = new Map()
const startCooldowns = new Map()

setInterval(() => {
    const now = Date.now()
    for (const [chatId, availableAt] of startCooldowns) {
        if (availableAt <= now) startCooldowns.delete(chatId)
    }
}, 60_000).unref()

function normalize(text) {
    return String(text || '')
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
                    text: '❌ Tidak ada game tebak anime yang sedang berjalan.'
                }, { quoted: ctx.msg })
            }
            return ctx.sock.sendMessage(ctx.from, {
                text: `🛑 Game dihentikan.\nJawabannya: *${game.anime.title}* (${game.anime.year}).`
            }, { quoted: ctx.msg })
        }

        if (games.has(ctx.from)) {
            return ctx.sock.sendMessage(ctx.from, {
                text: '⏳ Sudah ada game tebak anime yang berjalan di chat ini. Tunggu selesai atau ketik *!tebakanime stop*.'
            }, { quoted: ctx.msg })
        }

        const cooldownRemaining = remainingStartCooldown(ctx.from)
        if (cooldownRemaining > 0) {
            return ctx.sock.sendMessage(ctx.from, {
                text: `⏳ Tunggu *${Math.ceil(cooldownRemaining / 1000)} detik* sebelum memulai game Tebak Anime lagi.`
            }, { quoted: ctx.msg })
        }

        const charge = economy.charge(ctx, PLAY_COST)
        if (!charge.ok) {
            return ctx.sock.sendMessage(ctx.from, {
                text: `❌ Memulai *${config.prefix}tebakanime* butuh *${PLAY_COST} koin*, tapi saldo kamu cuma *${charge.balance} koin*.\nCari koin dulu lewat *${config.prefix}daily* atau *${config.prefix}work*.`
            }, { quoted: ctx.msg })
        }

        const anime = ANIME[Math.floor(Math.random() * ANIME.length)]
        const game = { anime, startedAt: Date.now(), timeoutId: null }
        games.set(ctx.from, game)
        startCooldowns.set(ctx.from, Date.now() + START_COOLDOWN_MS)

        game.timeoutId = setTimeout(async () => {
            const current = games.get(ctx.from)
            if (!current || current !== game) return
            games.delete(ctx.from)
            try {
                await ctx.sock.sendMessage(ctx.from, {
                    text: `⏰ Waktu habis!\nJawabannya: *${anime.title}* (${anime.year}).`
                })
            } catch (err) {
                console.error('[tebakanime] timeout reply failed:', err.message)
            }
        }, TIME_LIMIT_MS)

        try {
            await ctx.sock.sendMessage(ctx.from, {
                text:
                    `📺 *Tebak Anime!*\n\n` +
                    `📅 Tahun: *${anime.year}*\n` +
                    `🔤 Judul: \`${maskTitle(anime.title)}\` (${anime.title.replace(/\s/g, '').length} huruf)\n` +
                    `💡 Petunjuk: ${anime.hint}\n\n` +
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

    checkGuess: async ({ sock, msg, from, sender, body }) => {
        const game = games.get(from)
        if (!game) return false
        if (normalize(body) !== normalize(game.anime.title)) return false

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
                `Jawaban: *${game.anime.title}* (${game.anime.year}).` +
                (coinLine ? `\n${coinLine}` : ''),
            mentions: [pn]
        }, { quoted: msg })

        return true
    }
}
