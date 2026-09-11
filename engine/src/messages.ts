import { config } from "./config.js"
import type { BotSettings } from "./types.js"

// Premium English message templates shared across the bot.

export function styleReply(body: string, brand = config.replyBrand, footerText = config.replyFooter): string {
  return `*${brand}*\n${body}\n\n_${footerText}_`
}

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
    `SPIDER MINI — WHATSAPP CONTROL\n` +
    `_ARE YOU NOT ENTERTAINED? The legend is born!_\n\n` +
    `${LINE}\n` +
    `*SPIDER MINI REGISTRATION*\n` +
    `Warrior Number: ${number}\n` +
    (password
      ? `🏛️ Throne Password: *${password}*\n` +
        `_Protect your empire. This password guards your realm._\n`
      : "") +
    `📱 Arena Dashboard: ${config.pairUrl}\n\n` +
    `*BATTLE FEATURES ENABLED*\n` +
    `⚔️ Auto Status View: ${status(settings.autoStatusView)}\n` +
    `👑 Auto Status React: ${status(settings.autoStatusReact)}\n` +
    `🛡️ Anti View-Once Shield: ${status(settings.antiViewOnce)}\n` +
    `🧠 AI Oracle & Tools: ${status(settings.aiEnabled)}\n` +
    `🎨 Nano Banana Vision: ON\n` +
    `📜 Lyrics & Wisdom: ON\n` +
    `⌨️ Command Prefix: ${prefix}\n\n` +
    `⚡ Type *${prefix}menu* to enter the arena or visit dashboard.\n\n` +
    footer()
  )
}

export function getRandomMenuBanner(): string {
  const banners = [
    "./assets/menu-1.png",
    "./assets/menu-2.png",
    "./assets/menu-3.png",
    "./assets/menu-4.png",
  ]
  return banners[Math.floor(Math.random() * banners.length)]
}

export function getRandomAliveBanner(): string {
  const banners = [
    "./assets/alive-1.png",
    "./assets/alive-2.png",
    "./assets/alive-3.png",
    "./assets/alive-4.png",
  ]
  return banners[Math.floor(Math.random() * banners.length)]
}

export function getRandomPingBanner(): string {
  const banners = [
    "./assets/ping-1.png",
    "./assets/ping-2.png",
    "./assets/ping-3.png",
    "./assets/ping-4.png",
    "./assets/ping-5.png",
  ]
  return banners[Math.floor(Math.random() * banners.length)]
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
    `╭━〔 *${botName.toUpperCase()} MAXIMUS* 〕━⬣\n` +
    `┃ ◆\n` +
    `┃   ◆ STATUS : ${mode}\n` +
    `┃ ◆  Command Prefix : [ ${prefix} ]\n` +
    `┃   ◆ CORE: v3.2.1\n` +
    `┃    ◆ UPTIME  : ${uptime}\n` +
    `┃  ◆  Hosted at Hostify.co.zw\n` +
    `┃    ◆\n` +
    `╰━━━━━━━━━━━━━━━━━━━━⬣`

  const section = (title: string, items: string[]) =>
    `╭━━〔 ${title} 〕━━⬣\n` +
    items.map((i) => `┃➤ ${i}`).join("\n") +
    `\n╰━━━━━━━━━━━━━━━━━━━━⬣`

  const general = section("⚙️ SETTINGS", [
    `${prefix}menu`, `${prefix}ping`, `${prefix}alive`, `${prefix}pair`, `${prefix}status`,
  ])
  const downloads = section("🏆 DOWNLOADS", [
    `${prefix}play <song>`, `${prefix}download <url>`, `${prefix}dramadl <dramaId> <episodeId>`, `${prefix}sc <url>`, `${prefix}dub <url>`,
  ])
  const search = section("🔎 SEARCH & CONTENT", [
    `${prefix}lyrics <song>`, `${prefix}pinterest <query>`, `${prefix}yts <query>`,
  ])
  const create = section("✨ CREATE & EDIT", [
    `${prefix}remusic <prompt>`, `${prefix}rm <prompt>`, `${prefix}img <prompt>`,
    `${prefix}img <prompt> --luminux`, `${prefix}edit <image-url | prompt>`,
  ])
  const translate = section("🌐 TRANSLATE", [`${prefix}translate <lang> <text>`])
  const tools = section("⚒️ WARRIOR TOOLS", [
    `${prefix}vv`, `${prefix}vv2`, `${prefix}sr`, `${prefix}upload`, `${prefix}vcf`,
  ])
  const ai = section("🧠 AI", [`${prefix}ai <text>`, `${prefix}gpt <text>`])
  const groups = section("🏛️ ARENA MANAGEMENT (Dashboard)", [
    `Spider Mini group management in the dashboard`,
    `Warrior status, accept, kick, arena rules, arena hours`,
    `Anti-link shield, tag all warriors, spectator control, more`,
  ])
  const owner = section("👑 EMPEROR COMMANDS", [
    `${prefix}autoreact on/off — Auto applaud battles`,
    `${prefix}online on/off — Show online when active (smart mode)`,
    `${prefix}autotype on/off — Typing warrior animation`,
    `${prefix}password — Change throne password`,
    `${prefix}private — Emperor-only access`,
    `${prefix}public — Open arena access`,
    `${prefix}prank <url> — Send Spider Mini prank`,
    `${prefix}status — Check realm statistics`,
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

  const proFeatures = 
    `╭━━〔 ⚔️ SPIDER MINI LEGEND POWERS ⚔️ 〕━━⬣\n` +
    `┃ 🎵 *Remusic Studio* — Prompt lyrics, cover art, and audio\n` +
    `┃ 🎨 *Dual Image AI* — Generate epic visuals\n` +
    `┃ 🤖 *AI Battle Master* — Strategic responses\n` +
    `┃ 📥 *Trophy Collector* — Download all content\n` +
    `┃ 👥 *Arena Control* — Manage your warriors\n` +
    `┃ 🛡️ *Spectator Shield* — Anti-spam protection\n` +
    `┃ ⚡ *Smart Presence* — Online when battling\n` +
    `╰━━━━━━━━━━━━━━━━━━━━⬣`

  const credits =
    `╭━━━━━━━━━━━━━━━━━━━━⬣\n` +
    `┃ ⚔️ BRUTAL • FAST • LEGENDARY ⚔️\n` +
    `> Built by ${config.teamName}\n` +
    `> Powered by ${config.sponsor}\n` +
    `> Join arena: ${config.pairUrl}\n` +
    `╰━━━━━━━━━━━━━━━━━━━━⬣\n` +
    `> ⚔️ *SPIDER MINI MAXIMUS* ⚔️\n` +
    `> "ARE YOU NOT ENTERTAINED?"`

  const sections = [header, downloads, search, create, ai, translate, tools, general, credits]

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
