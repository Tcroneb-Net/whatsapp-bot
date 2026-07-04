import { config } from "./config.js"
import type { BotSettings } from "./types.js"

// Premium English message templates shared across the bot.

const LINE = "━━━━━━━━━━━━━━━━━━━━━"

export function footer(): string {
  return (
    `${LINE}\n` +
    `> By ${config.teamName}\n` +
    `> Sponsored by ${config.sponsor}\n` +
    `> Pair free at ${config.pairUrl}`
  )
}

export function welcomeMessage(opts: {
  botName: string
  number: string
  password?: string
  prefix: string
  settings: BotSettings
}): string {
  const { botName, number, password, prefix, settings } = opts
  const status = (on: boolean) => (on ? "ON" : "OFF")

  return (
    `*WELCOME TO ${botName.toUpperCase()}*\n` +
    `_Your personal WhatsApp assistant is now live._\n\n` +
    `${LINE}\n` +
    `*ACCOUNT DETAILS*\n` +
    `Number: ${number}\n` +
    (password
      ? `Dashboard Password: *${password}*\n` +
        `_Keep this safe. Use it to log in and manage your bot._\n`
      : "") +
    `Dashboard: ${config.pairUrl}\n\n` +
    `*FEATURES ENABLED*\n` +
    `Auto Status View: ${status(settings.autoStatusView)}\n` +
    `Auto Status Like: ${status(settings.autoStatusReact)}\n` +
    `Anti View-Once: ${status(settings.antiViewOnce)}\n` +
    `AI & Tools: ${status(settings.aiEnabled)}\n` +
    `Nano Banana AI Editor: ON\n` +
    `Lyrics & Quotes: ON\n` +
    `Command Prefix: ${prefix}\n\n` +
    `Type *${prefix}menu* to see all commands or visit dashboard for settings.\n\n` +
    footer()
  )
}

export function menuMessage(
  botName: string,
  prefix: string,
  meta?: {
    uptime?: string
    ram?: string
    mode?: string
    plugins?: Array<{ command: string; name: string; enabled?: boolean; category?: string }>
  },
): string {
  const uptime = meta?.uptime || "0s"
  const ram = meta?.ram || "—"
  const mode = meta?.mode || "PUBLIC"
  const plugins = meta?.plugins || []

  const header =
    `╭━〔 ☬ PREMIUM BOT ☬ 〕━⬣\n` +
    `┃ ${botName.toUpperCase()}\n` +
    `┃ ⚙️ Prefix : [ ${prefix} ]\n` +
    `┃ 🌐 Mode   : ${mode}\n` +
    `┃ ⏱️ Uptime : ${uptime}\n` +
    `┃ 💾 RAM    : ${ram}\n` +
    `╰━━━━━━━━━━━━━━━━━━━━⬣`

  const section = (title: string, items: string[]) =>
    `╭━━〔 ${title} 〕━━⬣\n` +
    items.map((i) => `┃➤ ${i}`).join("\n") +
    `\n╰━━━━━━━━━━━━━━━━━━━━⬣`

  const general = section("⚙️ GENERAL", [
    `${prefix}menu — This menu`,
    `${prefix}ping — Check latency & get quote`,
    `${prefix}alive — Bot status & quote`,
    `${prefix}pair — Pair new device`,
  ])
  const downloads = section("📥 MEDIA DOWNLOADS", [
    `${prefix}play <song> — Search & download MP3`,
    `${prefix}song <song> — Song with lyrics & video`,
    `${prefix}download <url> — TikTok, Instagram, Facebook, YouTube, etc.`,
    `${prefix}spotify <url> — Spotify tracks`,
    `${prefix}sc <url> — SoundCloud tracks`,
    `${prefix}dub <url> — AI voice dub for videos`,
  ])
  const search = section("🔎 SEARCH & CONTENT", [
    `${prefix}lyrics <song> — Song lyrics (professional format)`,
    `${prefix}quote — Random inspirational quote`,
    `${prefix}pinterest <query> — Image search`,
    `${prefix}yts <query> — YouTube search`,
  ])
  const create = section("✨ CREATE & EDIT", [
    `${prefix}edit <image-url | prompt> — Edit image with AI (nano-banana2)`,
    `${prefix}img <prompt> — Generate image with Flux AI`,
    `${prefix}suno <description> — Create music with AI`,
  ])
  const translate = section("🌐 TRANSLATE", [`${prefix}translate <lang> <text> — Translate text`])
  const ai = section("🤖 AI & CHAT", [
    `${prefix}ai <text> — Ask the AI assistant`,
    `${prefix}gpt <text> — ChatGPT-style responses`,
  ])
  const tools = section("🛠️ TOOLS & UTILITIES", [
    `${prefix}vv — View once message unlocker`,
    `${prefix}sr — React to status updates`,
    `${prefix}upload — Upload files to top4top (get link)`,
    `${prefix}translate <lang> <text> — Multi-language`,
  ])
  const groups = section("👥 GROUP COMMANDS (Dashboard)", [
    `Group management moved to dashboard for easy control`,
    `Status, accept, kick, link, auto-open, auto-close`,
    `Anti-link, tag-all, and more available in dashboard`,
  ])
  const owner = section("👑 OWNER", [
    `${prefix}online on/off — Always online`,
    `${prefix}autotype on/off — Auto typing`,
    `${prefix}password — Reset password`,
    `${prefix}private — Owner-only mode`,
    `${prefix}public — Everyone can use`,
    `${prefix}prank <url> — Send fun prank links to group`,
  ])

  // Group plugins by category
  const enabledPlugins = plugins.filter((p) => p.enabled !== false)
  const pluginsByCategory = {
    music: enabledPlugins.filter((p) => p.category === "music"),
    downloader: enabledPlugins.filter((p) => p.category === "downloader"),
    social: enabledPlugins.filter((p) => p.category === "social"),
    ai: enabledPlugins.filter((p) => p.category === "ai"),
    tools: enabledPlugins.filter((p) => p.category === "tools"),
    other: enabledPlugins.filter((p) => !p.category || p.category === "other"),
  }

  const pluginSections: string[] = []

  if (pluginsByCategory.music.length > 0) {
    pluginSections.push(
      section(
        "🎵 MUSIC",
        pluginsByCategory.music.map((p) => `${prefix}${p.command} — ${p.name}`),
      ),
    )
  }

  if (pluginsByCategory.downloader.length > 0) {
    pluginSections.push(
      section(
        "📥 DOWNLOADS",
        pluginsByCategory.downloader.map((p) => `${prefix}${p.command} — ${p.name}`),
      ),
    )
  }

  if (pluginsByCategory.social.length > 0) {
    pluginSections.push(
      section(
        "📱 SOCIAL",
        pluginsByCategory.social.map((p) => `${prefix}${p.command} — ${p.name}`),
      ),
    )
  }

  if (pluginsByCategory.ai.length > 0) {
    pluginSections.push(
      section(
        "🤖 AI",
        pluginsByCategory.ai.map((p) => `${prefix}${p.command} — ${p.name}`),
      ),
    )
  }

  if (pluginsByCategory.tools.length > 0) {
    pluginSections.push(
      section(
        "🛠️ TOOLS",
        pluginsByCategory.tools.map((p) => `${prefix}${p.command} — ${p.name}`),
      ),
    )
  }

  if (pluginsByCategory.other.length > 0) {
    pluginSections.push(
      section(
        "🔌 CUSTOM PLUGINS",
        pluginsByCategory.other.map((p) => `${prefix}${p.command} — ${p.name}`),
      ),
    )
  }

  const credits =
    `╭━━━━━━━━━━━━━━━━━━━━⬣\n` +
    `┃   Fast • Smooth • Powerful\n` +
    `> By ${config.teamName}\n` +
    `> Sponsored by ${config.sponsor}\n` +
    `> Pair free at ${config.pairUrl}\n` +
    `╰━━━━━━━━━━━━━━━━━━━━⬣\n` +
    `> ☬ *${botName.toUpperCase()}* ☬`

  const sections = [header, general, downloads, search, create, translate, ai, tools, groups, ...pluginSections, credits]

  return sections.join("\n\n")
}

// Format raw lyrics into a clean, spaced, verse-separated layout with a header.
export function lyricsMessage(opts: {
  title?: string
  artist?: string
  lyrics: string
}): string {
  const { title, artist, lyrics } = opts

  // Normalize line endings and collapse 3+ blank lines into a single break.
  const clean = lyrics
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  // Re-space verses: a blank line between stanzas, indented verse markers.
  const stanzas = clean.split(/\n\s*\n/).map((s) => s.trim())
  const body = stanzas
    .map((stanza, i) => {
      const lines = stanza
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n")
      return `_Verse ${i + 1}_\n${lines}`
    })
    .join("\n\n")

  const heading = title ? `🎵 *${title.toUpperCase()}*` : "🎵 *LYRICS*"
  const sub = artist ? `_${artist}_\n` : ""

  return `${heading}\n${sub}${LINE}\n\n${body}\n\n${LINE}\n${footer()}`
}

export function pairInfoMessage(): string {
  return (
    `*GET YOUR OWN FREE WHATSAPP BOT*\n\n` +
    `It only takes a minute:\n` +
    `1. Visit *${config.pairUrl}*\n` +
    `2. Enter your WhatsApp number\n` +
    `3. Copy the 8-digit pairing code\n` +
    `4. Open WhatsApp → Linked Devices → Link with phone number\n` +
    `5. Enter the code and you are live\n\n` +
    `Your bot will DM your dashboard password automatically.\n\n` +
    footer()
  )
}
