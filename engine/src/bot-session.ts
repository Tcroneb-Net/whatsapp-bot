import { createRequire } from "module"
import type {
  WASocket,
  WAMessage,
  proto,
} from "@whiskeysockets/baileys"
import { Boom } from "@hapi/boom"

// Baileys ships as CommonJS. Under Node's ESM interop, `import makeWASocket from
// "@whiskeysockets/baileys"` resolves to `module.exports` (the namespace object,
// not the factory function), which throws "makeWASocket is not a function" at
// runtime. Loading via createRequire gives us the real callable exports across
// Baileys versions.
const require = createRequire(import.meta.url)
const baileys = require("@whiskeysockets/baileys")
const makeWASocket: (...args: any[]) => WASocket =
  baileys.makeWASocket ?? baileys.default
const DisconnectReason: typeof import("@whiskeysockets/baileys").DisconnectReason =
  baileys.DisconnectReason
const downloadMediaMessage: typeof import("@whiskeysockets/baileys").downloadMediaMessage =
  baileys.downloadMediaMessage
import { config } from "./config.js"
import { logger, baileysLogger } from "./logger.js"
import { bots } from "./db.js"
import { useMongoAuthState, clearMongoAuthState } from "./mongo-auth-state.js"
import { DEFAULT_SETTINGS, type BotSettings } from "./types.js"

const RECONNECT_DELAY_MS = 3000

export class BotSession {
  readonly number: string
  private sock: WASocket | null = null
  private settings: BotSettings = DEFAULT_SETTINGS
  private saveCreds: (() => Promise<void>) | null = null
  private startTime = Date.now()
  private stopped = false
  private pendingPairingResolve: ((code: string) => void) | null = null

  constructor(number: string) {
    this.number = number
  }

  async loadSettings(): Promise<void> {
    const doc = await bots().findOne({ number: this.number })
    if (doc?.settings) {
      this.settings = { ...DEFAULT_SETTINGS, ...doc.settings }
    }
  }

  // Re-read settings from MongoDB so dashboard changes take effect live.
  async refreshSettings(): Promise<void> {
    await this.loadSettings()
  }

  isConnected(): boolean {
    return Boolean(this.sock?.user)
  }

  async start(): Promise<void> {
    this.stopped = false
    await this.loadSettings()

    const { state, saveCreds } = await useMongoAuthState(this.number)
    this.saveCreds = saveCreds

    this.sock = makeWASocket({
      auth: state,
      logger: baileysLogger,
      printQRInTerminal: false,
      // We never want the bot's own presence to show as "online" constantly.
      markOnlineOnConnect: false,
      syncFullHistory: false,
    })

    this.bindEvents()
  }

  // Request an 8-digit pairing code for this number. Must be called on a fresh
  // (unregistered) socket. Returns the code to display to the user.
  async requestPairingCode(): Promise<string> {
    if (!this.sock) {
      await this.start()
    }
    if (!this.sock) throw new Error("Socket failed to initialize")

    // If already registered, no pairing code is needed.
    if (this.sock.authState.creds.registered) {
      throw new Error("This number is already paired. Delete the session first to re-pair.")
    }

    // Baileys requires a short delay before requesting the code.
    await new Promise((r) => setTimeout(r, 1500))
    const code = await this.sock.requestPairingCode(this.number)
    // Format as XXXX-XXXX for readability.
    return code?.match(/.{1,4}/g)?.join("-") ?? code
  }

  private bindEvents(): void {
    if (!this.sock) return

    this.sock.ev.on("creds.update", async () => {
      await this.saveCreds?.()
    })

    this.sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update

      if (connection === "open") {
        this.startTime = Date.now()
        await this.setStatus("connected")
        logger.info({ number: this.number }, "connection open")
        // Follow the configured channel after connecting.
        void this.followChannel()
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut

        await this.setStatus("disconnected")
        logger.warn({ number: this.number, statusCode }, "connection closed")

        if (loggedOut) {
          // Credentials are no longer valid — clear them so we don't loop.
          await clearMongoAuthState(this.number)
          this.sock = null
          return
        }

        if (!this.stopped) {
          setTimeout(() => {
            void this.start().catch((err) =>
              logger.error({ number: this.number, err }, "reconnect failed"),
            )
          }, RECONNECT_DELAY_MS)
        }
      }
    })

    this.sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return
      for (const msg of messages) {
        try {
          await this.handleMessage(msg)
        } catch (err) {
          logger.error({ number: this.number, err }, "handleMessage error")
        }
      }
    })
  }

  private async setStatus(status: "pairing" | "connected" | "disconnected"): Promise<void> {
    await bots().updateOne(
      { number: this.number },
      { $set: { status, lastSeen: new Date(), updatedAt: new Date() } },
    )
  }

  private async handleMessage(msg: WAMessage): Promise<void> {
    if (!this.sock || !msg.message) return

    const remoteJid = msg.key.remoteJid
    if (!remoteJid) return

    // --- Status (story) updates ---
    if (remoteJid === "status@broadcast") {
      await this.handleStatus(msg)
      return
    }

    // --- Channel (newsletter) auto-react ---
    if (remoteJid.endsWith("@newsletter")) {
      await this.handleChannelMessage(msg)
      return
    }

    // --- Anti view-once ---
    if (this.settings.antiViewOnce) {
      await this.handleViewOnce(msg)
    }

    // --- Commands ---
    await this.handleCommands(msg, remoteJid)
  }

  private async handleStatus(msg: WAMessage): Promise<void> {
    if (!this.sock) return
    if (this.settings.autoStatusView) {
      try {
        await this.sock.readMessages([msg.key])
      } catch (err) {
        logger.debug({ err }, "status read failed")
      }
    }
    if (this.settings.autoStatusReact && msg.key.participant) {
      try {
        await this.sock.sendMessage(
          "status@broadcast",
          { react: { text: config.reactEmoji, key: msg.key } },
          { statusJidList: [msg.key.participant] },
        )
      } catch (err) {
        logger.debug({ err }, "status react failed")
      }
    }
  }

  private async handleChannelMessage(msg: WAMessage): Promise<void> {
    if (!this.sock) return
    try {
      await this.sock.sendMessage(msg.key.remoteJid!, {
        react: { text: config.reactEmoji, key: msg.key },
      })
    } catch (err) {
      logger.debug({ err }, "channel react failed")
    }
  }

  private getViewOnce(msg: WAMessage): proto.IMessage | null {
    const m = msg.message
    if (!m) return null
    const v2 = m.viewOnceMessageV2?.message
    const v2ext = m.viewOnceMessageV2Extension?.message
    const v1 = m.viewOnceMessage?.message
    return v2 || v2ext || v1 || null
  }

  private async handleViewOnce(msg: WAMessage): Promise<void> {
    if (!this.sock) return
    const inner = this.getViewOnce(msg)
    if (!inner) return

    const isImage = Boolean(inner.imageMessage)
    const isVideo = Boolean(inner.videoMessage)
    if (!isImage && !isVideo) return

    try {
      const buffer = (await downloadMediaMessage(
        { key: msg.key, message: inner } as WAMessage,
        "buffer",
        {},
      )) as Buffer

      const caption =
        (inner.imageMessage?.caption || inner.videoMessage?.caption || "") +
        `\n\n_Recovered view-once via ${this.settings.botName}_`

      // Destination: same chat the message came from, or the bot's own DM.
      const selfJid = this.sock.user?.id
      const destination =
        this.settings.viewOnceMode === "dm" && selfJid ? selfJid : msg.key.remoteJid!

      if (isImage) {
        await this.sock.sendMessage(destination, { image: buffer, caption })
      } else {
        await this.sock.sendMessage(destination, { video: buffer, caption })
      }
    } catch (err) {
      logger.debug({ err }, "view-once recovery failed")
    }
  }

  private extractText(msg: WAMessage): string {
    const m = msg.message
    if (!m) return ""
    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      ""
    )
  }

  private async handleCommands(msg: WAMessage, remoteJid: string): Promise<void> {
    if (!this.sock) return
    const text = this.extractText(msg).trim()
    const prefix = this.settings.prefix
    if (!text.startsWith(prefix)) return

    const command = text.slice(prefix.length).trim().split(/\s+/)[0]?.toLowerCase()

    if (command === "alive" && this.settings.aliveEnabled) {
      const uptime = this.formatUptime(Date.now() - this.startTime)
      await this.sock.sendMessage(
        remoteJid,
        {
          text:
            `*${this.settings.botName}* is alive and running.\n\n` +
            `Uptime: ${uptime}\n` +
            `Status: connected`,
        },
        { quoted: msg },
      )
    } else if (command === "ping" && this.settings.pingEnabled) {
      const start = Date.now()
      const sent = await this.sock.sendMessage(remoteJid, { text: "Pinging..." }, { quoted: msg })
      const latency = Date.now() - start
      if (sent?.key) {
        await this.sock.sendMessage(remoteJid, {
          text: `Pong! ${latency}ms`,
          edit: sent.key,
        })
      }
    }
  }

  private async followChannel(): Promise<void> {
    if (!this.sock || !config.channelJid) return
    const sock = this.sock as any
    try {
      // Preferred: typed helper when the running Baileys build exposes it.
      if (typeof sock.newsletterFollow === "function") {
        await sock.newsletterFollow(config.channelJid)
      } else {
        // Fallback: raw mex/newsletter subscribe query for builds that
        // don't surface newsletterFollow on the socket type.
        await sock.query({
          tag: "iq",
          attrs: {
            to: config.channelJid,
            type: "set",
            xmlns: "newsletter",
          },
          content: [{ tag: "follow", attrs: {} }],
        })
      }
      logger.info({ number: this.number, channel: config.channelJid }, "channel followed")
    } catch (err) {
      logger.debug({ err }, "channel follow failed (may already follow)")
    }
  }

  private formatUptime(ms: number): string {
    const sec = Math.floor(ms / 1000) % 60
    const min = Math.floor(ms / (1000 * 60)) % 60
    const hr = Math.floor(ms / (1000 * 60 * 60)) % 24
    const days = Math.floor(ms / (1000 * 60 * 60 * 24))
    const parts: string[] = []
    if (days) parts.push(`${days}d`)
    if (hr) parts.push(`${hr}h`)
    if (min) parts.push(`${min}m`)
    parts.push(`${sec}s`)
    return parts.join(" ")
  }

  async stop(): Promise<void> {
    this.stopped = true
    try {
      this.sock?.end(undefined)
    } catch {
      // ignore
    }
    this.sock = null
  }

  // Log out of WhatsApp and wipe all stored credentials for this number.
  async logoutAndWipe(): Promise<void> {
    this.stopped = true
    try {
      await this.sock?.logout()
    } catch {
      // ignore — we wipe regardless
    }
    try {
      this.sock?.end(undefined)
    } catch {
      // ignore
    }
    this.sock = null
    await clearMongoAuthState(this.number)
  }
}
