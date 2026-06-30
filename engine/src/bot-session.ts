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
// NOTE: do not name this `makeWASocket`. The imported `WASocket` type is
// defined as `ReturnType<typeof makeWASocket>`, so a local binding with that
// name shadows it and collapses the socket type to `never`.
const createWASocket: (...args: any[]) => WASocket =
  baileys.makeWASocket ?? baileys.default
const DisconnectReason: typeof import("@whiskeysockets/baileys").DisconnectReason =
  baileys.DisconnectReason
const downloadMediaMessage: typeof import("@whiskeysockets/baileys").downloadMediaMessage =
  baileys.downloadMediaMessage
const fetchLatestBaileysVersion: typeof import("@whiskeysockets/baileys").fetchLatestBaileysVersion =
  baileys.fetchLatestBaileysVersion
const Browsers: typeof import("@whiskeysockets/baileys").Browsers = baileys.Browsers
import { config } from "./config.js"
import { logger, baileysLogger } from "./logger.js"
import { bots } from "./db.js"
import { useMongoAuthState, clearMongoAuthState } from "./mongo-auth-state.js"
import { DEFAULT_SETTINGS, type BotSettings } from "./types.js"
import { hostify, safeHostify } from "./hostify.js"
import { welcomeMessage, menuMessage, pairInfoMessage } from "./messages.js"

const RECONNECT_DELAY_MS = 3000

export class BotSession {
  readonly number: string
  private sock: WASocket | null = null
  private settings: BotSettings = DEFAULT_SETTINGS
  private saveCreds: (() => Promise<void>) | null = null
  private startTime = Date.now()
  private stopped = false
  private pendingPairingResolve: ((code: string) => void) | null = null
  // Plaintext password held in memory only, to DM once on first connect.
  private pendingWelcomePassword: string | null = null
  private welcomeSent = false

  constructor(number: string) {
    this.number = number
  }

  setPendingWelcomePassword(password: string): void {
    this.pendingWelcomePassword = password
    this.welcomeSent = false
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

  async start(): Promise<WASocket> {
    this.stopped = false
    await this.loadSettings()

    const { state, saveCreds } = await useMongoAuthState(this.number)
    this.saveCreds = saveCreds

    // Always pin the current WhatsApp Web protocol version. Using a stale
    // version is the most common cause of "couldn't link because of errors".
    let version: [number, number, number] | undefined
    try {
      const latest = await fetchLatestBaileysVersion()
      version = latest.version
      logger.info({ number: this.number, version }, "using WA version")
    } catch (err) {
      logger.warn({ err }, "fetchLatestBaileysVersion failed; using bundled default")
    }

    this.sock = createWASocket({
      version,
      auth: state,
      logger: baileysLogger,
      printQRInTerminal: false,
      // A valid browser signature is required for pairing-code linking.
      browser: Browsers.ubuntu("Chrome"),
      // We never want the bot's own presence to show as "online" constantly.
      markOnlineOnConnect: false,
      syncFullHistory: false,
    })

    this.bindEvents()
    return this.sock
  }

  // Request an 8-digit pairing code for this number. Must be called on a fresh
  // (unregistered) socket whose websocket is already open. Returns the code to
  // display to the user.
  async requestPairingCode(): Promise<string> {
    // Always tear down any stale/closed socket and start fresh, otherwise a
    // previous failed attempt can leave us issuing a code on a dead connection.
    this.endSocket()

    const sock = await this.start()

    // If already registered, no pairing code is needed.
    if (sock.authState.creds.registered) {
      throw new Error("This number is already paired. Delete the session first to re-pair.")
    }

    // requestPairingCode sends a node immediately, so the websocket must be
    // open first. Wait for the connection to become ready before requesting.
    await this.waitForConnectionReady(sock)

    const code = await sock.requestPairingCode(this.number)
    // Format as XXXX-XXXX for readability.
    return code?.match(/.{1,4}/g)?.join("-") ?? code
  }

  // Cleanly end the current socket without flagging the session as stopped.
  private endSocket(): void {
    if (!this.sock) return
    try {
      this.sock.end(undefined)
    } catch {
      // ignore
    }
    this.sock = null
  }

  // Resolve once the socket is ready to negotiate pairing. Baileys emits a
  // connection.update with `qr` set after the noise handshake completes, which
  // is the safe point to request a pairing code. Falls back after a timeout.
  private waitForConnectionReady(sock: WASocket, timeoutMs = 20000): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const handler = (update: { connection?: string; qr?: string }) => {
        if (update.qr || update.connection === "open") {
          finish()
        }
      }
      const finish = () => {
        if (settled) return
        settled = true
        sock.ev.off("connection.update", handler)
        // Small settle delay so the socket is fully ready to send the node.
        setTimeout(resolve, 500)
      }
      sock.ev.on("connection.update", handler)
      // Safety fallback so we never hang forever.
      setTimeout(finish, timeoutMs)
    })
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
        // Send the rich welcome (with password) once, after pairing.
        void this.sendWelcome()
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

  // The bot's own JID (for DMing the owner).
  private ownJid(): string | null {
    const id = this.sock?.user?.id
    if (!id) return null
    // Normalize "12345:6@s.whatsapp.net" -> "12345@s.whatsapp.net".
    return id.includes(":") ? id.split(":")[0] + "@s.whatsapp.net" : id
  }

  // Fetch an image URL into a buffer; returns null on any failure so callers
  // can gracefully fall back to a text-only message.
  private async fetchImage(url: string): Promise<Buffer | null> {
    if (!url) return null
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      const arr = await res.arrayBuffer()
      return Buffer.from(arr)
    } catch {
      return null
    }
  }

  // Send a branded message with an optional banner image + caption.
  private async sendBranded(jid: string, caption: string, imageUrl?: string): Promise<void> {
    if (!this.sock) return
    const url = imageUrl || this.settings.welcomeImageUrl || config.defaultImageUrl
    const image = await this.fetchImage(url)
    if (image) {
      await this.sock.sendMessage(jid, { image, caption })
    } else {
      await this.sock.sendMessage(jid, { text: caption })
    }
  }

  // DM the owner a rich welcome (with image + password) once after pairing.
  private async sendWelcome(): Promise<void> {
    if (this.welcomeSent) return
    const jid = this.ownJid()
    if (!jid) return
    this.welcomeSent = true
    try {
      const caption = welcomeMessage({
        botName: this.settings.botName,
        number: this.number,
        password: this.pendingWelcomePassword ?? undefined,
        prefix: this.settings.prefix,
        settings: this.settings,
      })
      await this.sendBranded(jid, caption)
    } catch (err) {
      logger.error({ number: this.number, err }, "welcome send failed")
    } finally {
      // Wipe the plaintext password from memory after the attempt.
      this.pendingWelcomePassword = null
    }
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
    if (!prefix || !text.startsWith(prefix)) return

    const withoutPrefix = text.slice(prefix.length).trim()
    const command = withoutPrefix.split(/\s+/)[0]?.toLowerCase() ?? ""
    const args = withoutPrefix.slice(command.length).trim()
    const reply = (body: string) => this.sock!.sendMessage(remoteJid, { text: body }, { quoted: msg })

    try {
      switch (command) {
        case "alive":
          if (this.settings.aliveEnabled) await this.cmdAlive(remoteJid, msg)
          break
        case "ping":
          if (this.settings.pingEnabled) await this.cmdPing(remoteJid, msg)
          break
        case "menu":
        case "help":
          await this.sendBranded(remoteJid, menuMessage(this.settings.botName, prefix))
          break
        case "pair":
          await this.sendBranded(remoteJid, pairInfoMessage())
          break
        case "pairwhats": {
          const jid = this.ownJid()
          if (jid) await this.sendBranded(jid, pairInfoMessage())
          await reply("I've sent the pairing details to your DM.")
          break
        }
        case "ai":
        case "gpt":
          await this.cmdAi(args, reply)
          break
        case "translate":
        case "tr":
          await this.cmdTranslate(args, reply)
          break
        case "lyrics":
          await this.cmdLyrics(args, reply)
          break
        case "yts":
        case "ytsearch":
          await this.cmdYouTubeSearch(args, reply)
          break
        case "pinterest":
        case "pin":
          await this.cmdPinterest(args, remoteJid, reply)
          break
        case "play":
          await this.cmdPlay(args, remoteJid, reply)
          break
        case "song":
        case "ytmp3":
          await this.cmdYtMp3(args, remoteJid, reply)
          break
        case "video":
        case "ytmp4":
          await this.cmdYouTubeVideo(args, remoteJid, reply)
          break
        case "dub":
          await this.cmdDub(args, remoteJid, reply)
          break
        default:
          // Unknown command — stay silent to avoid noise.
          break
      }
    } catch (err) {
      logger.error({ number: this.number, command, err }, "command failed")
      await reply("Something went wrong while running that command. Please try again.").catch(() => {})
    }
  }

  private async cmdAlive(remoteJid: string, msg: WAMessage): Promise<void> {
    const uptime = this.formatUptime(Date.now() - this.startTime)
    await this.sock!.sendMessage(
      remoteJid,
      {
        text:
          `*${this.settings.botName}* is alive and running.\n\n` +
          `Uptime: ${uptime}\n` +
          `Status: connected`,
      },
      { quoted: msg },
    )
  }

  private async cmdPing(remoteJid: string, msg: WAMessage): Promise<void> {
    const start = Date.now()
    const sent = await this.sock!.sendMessage(remoteJid, { text: "Pinging..." }, { quoted: msg })
    const latency = Date.now() - start
    if (sent?.key) {
      await this.sock!.sendMessage(remoteJid, { text: `Pong! ${latency}ms`, edit: sent.key })
    }
  }

  private aiGuard(reply: (b: string) => Promise<unknown>): boolean {
    if (!this.settings.aiEnabled) {
      void reply("AI & tools are turned off. Enable them from your dashboard to use this command.")
      return false
    }
    return true
  }

  private async cmdAi(args: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!this.aiGuard(reply)) return
    if (!args) return void reply("Usage: ai <your question>")
    const answer = await safeHostify(() => hostify.ai(args))
    await reply(answer ? answer : "The AI is unavailable right now. Please try again shortly.")
  }

  private async cmdTranslate(args: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!this.aiGuard(reply)) return
    // Format: "<lang> | <text>" or "<lang> <text>".
    let lang = "english"
    let text = args
    if (args.includes("|")) {
      const [l, ...rest] = args.split("|")
      lang = l.trim() || lang
      text = rest.join("|").trim()
    } else {
      const parts = args.split(/\s+/)
      if (parts.length > 1) {
        lang = parts[0]
        text = parts.slice(1).join(" ")
      }
    }
    if (!text) return void reply("Usage: translate <language> | <text>")
    const out = await safeHostify(() => hostify.translate(text, lang))
    await reply(out ? `*Translation (${lang})*\n\n${out}` : "Translation failed. Please try again.")
  }

  private async cmdLyrics(args: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!this.aiGuard(reply)) return
    if (!args) return void reply("Usage: lyrics <song name>")
    const res = await safeHostify(() => hostify.lyrics(args))
    if (!res || !res.lyrics) return void reply("No lyrics found for that search.")
    const head = res.title ? `*${res.title}*\n\n` : ""
    await reply((head + res.lyrics).slice(0, 4000))
  }

  private async cmdYouTubeSearch(args: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!this.aiGuard(reply)) return
    if (!args) return void reply("Usage: yts <search query>")
    const list = await safeHostify(() => hostify.youtubeSearch(args))
    if (!list || list.length === 0) return void reply("No results found.")
    const top = list.slice(0, 6)
    const body = top
      .map((v: any, i: number) => {
        const title = v?.title || v?.name || "Untitled"
        const url = v?.url || v?.link || ""
        const dur = v?.duration || v?.timestamp || ""
        return `${i + 1}. *${title}*${dur ? ` (${dur})` : ""}\n${url}`
      })
      .join("\n\n")
    await reply(`*YouTube results for "${args}"*\n\n${body}`)
  }

  private async cmdPinterest(
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.aiGuard(reply)) return
    if (!args) return void reply("Usage: pinterest <search query>")
    const urls = await safeHostify(() => hostify.pinterest(args))
    if (!urls || urls.length === 0) return void reply("No images found.")
    await reply(`Sending top images for "${args}"...`)
    for (const url of urls.slice(0, 5)) {
      const img = await this.fetchImage(url)
      if (img) await this.sock!.sendMessage(remoteJid, { image: img }).catch(() => {})
    }
  }

  private async cmdPlay(
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.aiGuard(reply)) return
    if (!args) return void reply("Usage: play <song name>")
    await reply(`Searching SoundCloud for "${args}"...`)
    const res = await safeHostify(() => hostify.soundcloud(args))
    if (!res?.url) return void reply("Could not find that track.")
    await this.sock!.sendMessage(remoteJid, {
      audio: { url: res.url },
      mimetype: "audio/mpeg",
      fileName: `${res.title || args}.mp3`,
    })
  }

  private async cmdYtMp3(
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.aiGuard(reply)) return
    if (!args) return void reply("Usage: song <youtube url>")
    await reply("Downloading audio, please wait...")
    const res = await safeHostify(() => hostify.ytmp3(args))
    if (!res?.url) return void reply("Download failed. Check the URL and try again.")
    await this.sock!.sendMessage(remoteJid, {
      audio: { url: res.url },
      mimetype: "audio/mpeg",
      fileName: `${res.title || "audio"}.mp3`,
    })
  }

  private async cmdYouTubeVideo(
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.aiGuard(reply)) return
    if (!args) return void reply("Usage: video <youtube url>")
    await reply("Downloading video, please wait...")
    const res = await safeHostify(() => hostify.youtube(args))
    if (!res?.url) return void reply("Download failed. Check the URL and try again.")
    await this.sock!.sendMessage(remoteJid, {
      video: { url: res.url },
      caption: res.title || "",
    })
  }

  private async cmdDub(
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.aiGuard(reply)) return
    // Format: "<url> | <prompt>" — defaults voice to en-US.
    const [url, prompt = ""] = args.split("|").map((s) => s.trim())
    if (!url) return void reply("Usage: dub <video url> | <optional prompt>")
    await reply("Dubbing your video, this can take a moment...")
    const res = await safeHostify(() => hostify.dubbing(url, "en-US", prompt))
    if (!res?.url) return void reply("Dubbing failed. Please try again later.")
    await this.sock!.sendMessage(remoteJid, { video: { url: res.url }, caption: "Dubbed video" })
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
