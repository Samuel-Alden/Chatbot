# WhatsApp Bot

A multi-feature WhatsApp bot built with Baileys. It includes group moderation, stickers, downloads, alarms, reminders, AI chat, QR codes, translation, TTS, attendance, voting, lists, and basic bot status commands.

## Requirements

- Node.js 20 or newer
- npm
- `git`
- `yt-dlp` available on your `PATH` for YouTube/TikTok downloads
- `ffmpeg` for media conversion

Media commands prefer a system `ffmpeg` found on your `PATH`. On desktop platforms, the bundled `@ffmpeg-installer/ffmpeg` fallback is still used when available. On Android/Termux, install system `ffmpeg`.

## Setup

```bash
npm install
cp .env.example .env
npm start
```

On first start, scan the QR code in the terminal with WhatsApp. Session files are saved in `auth_info/`.

## Android / Termux

This bot can run on Android through Termux with a few practical caveats:

- keep `ffmpeg` and `yt-dlp` available on your `PATH`
- disable battery optimization for Termux or Android may suspend the bot
- use `termux-wake-lock` before starting the bot if you want it to stay alive longer

Suggested setup:

```bash
pkg update
pkg install git ffmpeg python
pkg install nodejs-lts || pkg install nodejs
pip install -U yt-dlp
git clone <your-repo-url>
cd whatsapp-bot
npm install
cp .env.example .env
termux-wake-lock
npm start
```

Notes:

- `!ytmp3`, `!ytmp4`, and `!tiktok` require both `yt-dlp` and `ffmpeg`
- `!sticker` and `!tts` require `ffmpeg`
- `!brat` also depends on `@napi-rs/canvas`; if that native module does not load on your device, only the `!brat` command is affected
- alarms and reminders only work while the bot process is alive, so Termux:Boot and a charger are strongly recommended for a phone-hosted bot

## Environment

Create `.env` with the values you need:

```env
BOT_NAME=Riwoo
PREFIX=!
OWNER_NUMBER=628xxxxxxxxxx
LOG_LEVEL=warn

GROQ_API_KEY=
AI_MODEL=llama-3.3-70b-versatile
AI_MAX_TOKENS=1024
AI_MAX_HISTORY=20
AI_SESSION_TTL_MINUTES=30
AI_SYSTEM_PROMPT=You are a helpful WhatsApp bot assistant. Keep responses concise and friendly. Use simple formatting since this is WhatsApp.
```

`OWNER_NUMBER` should be digits only, without `@s.whatsapp.net`.

## Commands

Run `!menu` in WhatsApp to see the generated command menu. Run `!help <command>` for command-specific details, for example:

```text
!help sticker
!help ai
!help addalarm
```

### Werewolf

Start a group game with:

```text
!werewolf create
!werewolf join
!werewolf start
```

The bot privately messages roles and night actions. During the day, living players vote in the group:

```text
!werewolf vote @user
!werewolf votes
```

Werewolf also has the short alias `!ww`.

### Economy

The bot includes a persistent, group-scoped coin system. Coins earned in one group cannot be spent in another group.

```text
!balance
!daily
!work
!give @user 250
!coinflip heads 100
!richest
```

Owner-only tools are available through `!eco`, for example `!eco add @user 1000`.

## Development

```bash
npm test
```

The current test script performs JavaScript syntax checks across the project. Add behavior tests around command parsing, moderation, and persistence before making larger changes.

## Data

Runtime data is stored as JSON under `data/`. WhatsApp auth state is stored under `auth_info/`. Keep both out of public repositories because they may contain private group/user data or account credentials.
