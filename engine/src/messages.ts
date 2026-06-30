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

export function menuMessage(botName: string, prefix: string): string {
  return (
    `*${botName.toUpperCase()} — COMMAND MENU*\n` +
    `_Premium WhatsApp automation & tools._\n\n` +
    `${LINE}\n` +
    `*GENERAL*\n` +
    `${prefix}menu — Show this menu\n` +
    `${prefix}alive — Check if the bot is online\n` +
    `${prefix}ping — Check response speed\n\n` +
    `*AI & LANGUAGE*\n` +
    `${prefix}ai <text> — Ask the AI anything\n` +
    `${prefix}translate <lang> | <text> — Translate text\n\n` +
    `*SEARCH*\n` +
    `${prefix}yts <query> — Search YouTube\n` +
    `${prefix}pinterest <query> — Search Pinterest images\n` +
    `${prefix}lyrics <song> — Find song lyrics\n\n` +
    `*MUSIC & DOWNLOADS*\n` +
    `${prefix}play <song> — Play from SoundCloud\n` +
    `${prefix}song <youtube url> — Download audio (MP3)\n` +
    `${prefix}video <youtube url> — Download video\n` +
    `${prefix}dub <video url> — AI dub a video\n\n` +
    `*PAIRING*\n` +
    `${prefix}pair — How to get your own bot\n` +
    `${prefix}pairwhats — Get pairing details in your DM\n\n` +
    footer()
  )
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
