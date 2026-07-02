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
    `*CURRENT SETUP*\n` +
    `Auto Status View: ${status(settings.autoStatusView)}\n` +
    `Auto Status Like: ${status(settings.autoStatusReact)}\n` +
    `Anti View-Once: ${status(settings.antiViewOnce)} (${settings.viewOnceMode === "dm" ? "saved to your DM" : "saved to same chat"})\n` +
    `AI & Tools: ${status(settings.aiEnabled)}\n` +
    `Command Prefix: ${prefix}\n\n` +
    `Type *${prefix}menu* to see everything I can do.\n\n` +
    footer()
  )
}

export function menuMessage(
  botName: string,
  prefix: string,
  meta?: { uptime?: string; ram?: string; mode?: string; plugins?: Array<{ command: string; name: string; enabled?: boolean }> },
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
    `${prefix}menu`,
    `${prefix}ping`,
    `${prefix}alive`,
    `${prefix}pair`,
    `${prefix}pairwhats`,
  ])
  const downloads = section("📥 DOWNLOADS", [
    `${prefix}play <song> — SoundCloud`,
    `${prefix}video <url> — YouTube video`,
    `${prefix}song <url> — YouTube MP3`,
    `${prefix}dub <url> — AI dub a video`,
  ])
  const search = section("🔎 SEARCH", [
    `${prefix}lyrics <song> — Song lyrics`,
    `${prefix}pinterest <query> — Images`,
    `${prefix}yts <query> — YouTube search`,
  ])
  const translate = section("🌐 TRANSLATE", [`${prefix}translate <lang> <text>`])
  const ai = section("🤖 AI", [`${prefix}ai <text> — Ask the AI`])
  const tools = section("🛡️ TOOLS", [`${prefix}vv — Unlock a view-once media`])
  const owner = section("👑 OWNER", [
    `${prefix}online on/off — Always online`,
    `${prefix}autotype on/off — Auto typing`,
    `${prefix}password — Reset password`,
    `${prefix}private — Owner-only mode`,
    `${prefix}public — Everyone can use`,
  ])

  const pluginItems = plugins
    .filter((p) => p.enabled !== false)
    .map((p) => `${p.command} — ${p.name}`)
  const pluginsSection = pluginItems.length > 0 ? section("🔌 CUSTOM PLUGINS", pluginItems) : ""

  const credits =
    `╭━━━━━━━━━━━━━━━━━━━━⬣\n` +
    `┃   Fast • Smooth • Powerful\n` +
    `> By ${config.teamName}\n` +
    `> Sponsored by ${config.sponsor}\n` +
    `> Pair free at ${config.pairUrl}\n` +
    `╰━━━━━━━━━━━━━━━━━━━━⬣\n` +
    `> ☬ *${botName.toUpperCase()}* ☬`

  const sections = [header, general, downloads, search, translate, ai, tools, owner]
  if (pluginsSection) sections.push(pluginsSection)
  sections.push(credits)

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
