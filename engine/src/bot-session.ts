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
import bcrypt from "bcryptjs"
import os from "os"
import { readFile } from "fs/promises"
import { config, bannerUrl, bannerFilePath, randomEmoji, pickRandomEmoji, type BannerCategory } from "./config.js"
import { logger, baileysLogger } from "./logger.js"
import { bots, viewOnceLogs } from "./db.js"
import { useMongoAuthState, clearMongoAuthState } from "./mongo-auth-state.js"
import { DEFAULT_SETTINGS, type BotSettings } from "./types.js"
import { hostify, safeHostify } from "./hostify.js"
import { welcomeMessage, menuMessage, pairInfoMessage, lyricsMessage } from "./messages.js"

const PRESENCE_KEEPALIVE_MS = 10 * 60 * 1000

// Generate a readable random dashboard password.
function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  let out = ""
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

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
  // Keepalive timer that holds the "always online" presence.
  private presenceTimer: ReturnType<typeof setInterval> | null = null
  // Periodic settings refresh from MongoDB (auto-sync dashboard changes).
  private settingsRefreshTimer: ReturnType<typeof setInterval> | null = null
  // Cache for search results (for .download command)
  private searchCache: Record<string, any> = {}

  constructor(number: string) {
    this.number = number
  }

  setPendingWelcomePassword(password: string): void {
    this.pendingWelcomePassword = password
    this.welcomeSent = false
  }

  async loadSettings(): Promise<void> {
    try {
      const doc = await bots().findOne({ number: this.number })
      this.settings = { ...DEFAULT_SETTINGS, ...doc?.settings }
      logger.debug(
        {
          autoStatusReact: this.settings.autoStatusReact,
          antiViewOnce: this.settings.antiViewOnce,
          botName: this.settings.botName,
        },
        "loaded settings from database",
      )
      // Note: Do NOT write back settings here - only read from DB.
      // The dashboard will update MongoDB, and this method just syncs the in-memory cache.
    } catch (err) {
      logger.error({ err }, "failed to load settings")
    }
  }

  // Save current settings to MongoDB
  private async saveSettings(): Promise<void> {
    try {
      await bots().updateOne(
        { number: this.number },
        { $set: { settings: this.settings, updatedAt: new Date() } }
      )
      logger.debug({ number: this.number }, "Settings saved")
    } catch (err) {
      logger.debug({ err }, "Failed to save settings")
    }
  }

  // Re-read settings from MongoDB so dashboard changes take effect live.
  async refreshSettings(): Promise<void> {
    await this.loadSettings()
    // Re-apply presence in case "always online" was toggled from the dashboard.
    this.applyPresence()
  }

  // Apply (or remove) the always-online presence keepalive.
  private applyPresence(): void {
    this.clearPresenceTimer()
    if (!this.sock || !this.settings.alwaysOnline) return
    const ping = () => {
      this.sock?.sendPresenceUpdate("available").catch(() => {})
    }
    ping()
    this.presenceTimer = setInterval(ping, PRESENCE_KEEPALIVE_MS)
  }

  private clearPresenceTimer(): void {
    if (this.presenceTimer) {
      clearInterval(this.presenceTimer)
      this.presenceTimer = null
    }
  }

  // Periodically re-sync settings from MongoDB so dashboard changes take effect.
  private startSettingsRefresh(): void {
    if (this.settingsRefreshTimer) clearInterval(this.settingsRefreshTimer)
    // Refresh every 30 seconds while connected
    this.settingsRefreshTimer = setInterval(async () => {
      try {
        await this.refreshSettings()
      } catch (err) {
        logger.debug({ err }, "periodic settings refresh failed")
      }
    }, 30000)
  }

  private clearSettingsRefreshTimer(): void {
    if (this.settingsRefreshTimer) {
      clearInterval(this.settingsRefreshTimer)
      this.settingsRefreshTimer = null
    }
  }

  // Show a brief "typing..." indicator before replying, when enabled.
  private async sendTyping(jid: string): Promise<void> {
    if (!this.sock || !this.settings.autoTyping) return
    try {
      await this.sock.sendPresenceUpdate("composing", jid)
    } catch {
      // ignore presence failures
    }
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
      // Honor the user's "always online" preference for initial presence.
      markOnlineOnConnect: this.settings.alwaysOnline,
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
        // Apply the always-online presence preference.
        this.applyPresence()
        // Start periodic settings refresh so dashboard changes sync automatically.
        this.startSettingsRefresh()
        // Promote owner as admin in all groups where bot is admin
        void this.promoteOwnerAsAdmin()
      }

      if (connection === "close") {
        this.clearSettingsRefreshTimer()
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut

        await this.setStatus("disconnected")
        this.clearPresenceTimer()
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

  // Promote the bot owner as admin in all groups where the bot is admin.
  private async promoteOwnerAsAdmin(): Promise<void> {
    if (!this.sock) return
    try {
      const chats = await this.sock.groupFetchAllParticipating()
      const ownerJid = this.ownJid()
      if (!ownerJid) return

      for (const [jid, groupData] of Object.entries(chats)) {
        if (!jid.endsWith("@g.us")) continue
        try {
          const metadata = await this.sock.groupMetadata(jid)
          const botIsAdmin = metadata.participants.find((p) => p.id === this.sock?.user?.id)?.isAdmin
          const ownerIsAdmin = metadata.participants.find((p) => p.id === ownerJid)?.isAdmin

          if (botIsAdmin && !ownerIsAdmin) {
            await this.sock.groupParticipantsUpdate(jid, [ownerJid], "promote")
            logger.debug({ jid, owner: ownerJid }, "promoted owner as admin")
          }
        } catch (err) {
          logger.debug({ jid, err }, "failed to promote owner in group")
        }
      }
    } catch (err) {
      logger.debug({ err }, "promoteOwnerAsAdmin failed")
    }
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

  // Load the banner image buffer for a category. Order of preference:
  // 1. The user's custom image URL (welcome/menu only).
  // 2. The bundled local asset file (always available, no network needed).
  // 3. A remote URL (asset base / default), as a last resort.
  private async loadBanner(category: BannerCategory): Promise<Buffer | null> {
    if ((category === "welcome" || category === "menu") && this.settings.welcomeImageUrl) {
      const custom = await this.fetchImage(this.settings.welcomeImageUrl)
      if (custom) return custom
    }
    const localPath = bannerFilePath(category)
    if (localPath) {
      try {
        return await readFile(localPath)
      } catch {
        // fall through to remote
      }
    }
    return this.fetchImage(bannerUrl(category))
  }

  // Send a branded message with a banner image + caption (falls back to text).
  private async sendBranded(
    jid: string,
    caption: string,
    category: BannerCategory = "welcome",
  ): Promise<void> {
    if (!this.sock) return
    await this.sendTyping(jid)
    const image = await this.loadBanner(category)
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

    // --- Anti view-once: auto-recover if enabled ---
    if (this.settings.antiViewOnce) {
      try {
        await this.handleViewOnce(msg)
      } catch (err) {
        logger.debug({ err }, "view-once handler error")
      }
    }

    // --- Anti-link: detect and kick if enabled ---
    if (this.settings.antiLink?.enabled && remoteJid.endsWith("@g.us")) {
      try {
        await this.handleAntiLink(msg, remoteJid)
      } catch (err) {
        logger.debug({ err }, "antilink handler error")
      }
    }



    // --- Commands ---
    await this.handleCommands(msg, remoteJid)
  }

  private async handleStatus(msg: WAMessage): Promise<void> {
    if (!this.sock) return
    logger.debug(
      {
        autoStatusView: this.settings.autoStatusView,
        autoStatusReact: this.settings.autoStatusReact,
        sender: msg.key.participant,
      },
      "handleStatus called",
    )
    if (this.settings.autoStatusView) {
      try {
        await this.sock.readMessages([msg.key])
      } catch (err) {
        logger.debug({ err }, "status read failed")
      }
    }
    if (this.settings.autoStatusReact) {
      try {
        const emoji = pickRandomEmoji(this.settings.statusReactEmojis)
        // Try modern approach first: use react with statusJidList if participant exists
        const participant =
          msg.key.participant ||
          (msg as any).participant ||
          (msg.key as any).remoteJidAlt
        
        if (participant) {
          try {
            // Modern Baileys: statusJidList parameter
            await this.sock.sendMessage(
              "status@broadcast",
              { react: { text: emoji, key: msg.key } },
              { statusJidList: [participant] },
            )
            return
          } catch {
            // Fall through to alternative method
          }
        }
        
        // Fallback: send reaction without statusJidList (works on most versions)
        await this.sock.sendMessage(
          "status@broadcast",
          { react: { text: emoji, key: msg.key } },
        )
      } catch (err) {
        logger.debug({ err }, "status react failed")
      }
    }
  }

  private async handleChannelMessage(msg: WAMessage): Promise<void> {
    if (!this.sock) return
    const jid = msg.key.remoteJid
    if (!jid) return
    
    // Only auto-react on the configured channel (the owner's channel), not on
    // other random channels the bot may have been added to.
    if (!config.channelJid || jid !== config.channelJid) return
    
    // Newsletter (channel) reactions require the message's server_id and the
    // dedicated newsletterReactMessage API — the normal `react` does not work.
    const serverId = (msg.key as any).server_id ?? (msg as any).newsletterServerId
    const sock = this.sock as any
    try {
      const emoji = randomEmoji()
      if (serverId && typeof sock.newsletterReactMessage === "function") {
        await sock.newsletterReactMessage(jid, String(serverId), emoji)
      } else {
        // Fallback for builds without the helper.
        await this.sock.sendMessage(jid, { react: { text: emoji, key: msg.key } })
      }
    } catch (err) {
      logger.debug({ err }, "channel react failed")
    }
  }

  private getViewOnce(msg: WAMessage): proto.IMessage | null {
    const m = msg.message
    if (!m) return null
    // Classic wrapped view-once variants.
    const wrapped =
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.viewOnceMessage?.message
    if (wrapped) return wrapped
    // Newer clients send a normal image/video carrying a `viewOnce: true` flag.
    if (m.imageMessage?.viewOnce || m.videoMessage?.viewOnce) return m
    return null
  }

  private async recoverViewOnce(
    inner: proto.IMessage,
    key: WAMessage["key"],
    destination: string,
  ): Promise<boolean> {
    if (!this.sock) return false
    const isImage = Boolean(inner.imageMessage)
    const isVideo = Boolean(inner.videoMessage)
    if (!isImage && !isVideo) return false

    const buffer = (await downloadMediaMessage(
      { key, message: inner } as WAMessage,
      "buffer",
      {},
    )) as Buffer

    const caption =
      (inner.imageMessage?.caption || inner.videoMessage?.caption || "") +
      `\n\n_Recovered view-once via ${this.settings.botName}_`

    if (isImage) {
      await this.sock.sendMessage(destination, { image: buffer, caption })
    } else {
      await this.sock.sendMessage(destination, { video: buffer, caption })
    }
    return true
  }

  private async handleViewOnce(msg: WAMessage): Promise<void> {
    if (!this.sock) return
    const inner = this.getViewOnce(msg)
    logger.debug(
      {
        antiViewOnce: this.settings.antiViewOnce,
        hasInner: !!inner,
        mediaType: inner?.imageMessage ? "image" : inner?.videoMessage ? "video" : null,
      },
      "handleViewOnce called",
    )
    if (!inner) return
    
    // Auto-recover view-once media if the setting is enabled
    if (!this.settings.antiViewOnce) {
      logger.debug({number: this.number}, "antiViewOnce disabled, skipping recovery")
      return
    }

    // Destination: same chat the message came from, or the bot's own DM.
    // ownJid() normalizes the device-suffixed id (e.g. "123:6@...").
    const selfJid = this.ownJid()
    const destination =
      this.settings.viewOnceMode === "dm" && selfJid ? selfJid : msg.key.remoteJid!

    try {
      const mediaType = inner.imageMessage ? "image" : inner.videoMessage ? "video" : null
      const caption = inner.imageMessage?.caption || inner.videoMessage?.caption || ""
      const sender = msg.key.participant || msg.key.remoteJid || "unknown"
      
      const ok = await this.recoverViewOnce(inner, msg.key, destination)
      
      // Log the recovered media to the dashboard
      if (ok && (mediaType === "image" || mediaType === "video")) {
        try {
          await viewOnceLogs().insertOne({
            number: this.number,
            timestamp: new Date(),
            mediaType,
            sender,
            caption: caption || undefined,
            recovered: true,
          })
        } catch (logErr) {
          logger.debug({ logErr }, "failed to log recovered view-once")
        }
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





  private async handleAntiLink(msg: WAMessage, remoteJid: string): Promise<void> {
    if (!this.sock) return

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || ""
    if (!text) return

    // Regex patterns for blocked links
    const linkPatterns = [
      /https?:\/\/(www\.)?chat\.whatsapp\.com/i,
      /https?:\/\/(www\.)?(youtube\.com|youtu\.be)/i,
      /https?:\/\/(www\.)?instagram\.com/i,
      /https?:\/\/(www\.)?facebook\.com/i,
      /https?:\/\/(www\.)?tiktok\.com/i,
      /https?:\/\/(vt\.tiktok\.com)/i,
      /https?:\/\/(www\.)?ig\.me/i,
      /https?:\/\/(www\.)?fb\.me/i,
    ]

    const hasLink = linkPatterns.some((pattern) => pattern.test(text))
    if (!hasLink) return

    try {
      const sender = msg.key.participant || msg.key.remoteJid
      if (!sender) return

      const groupMetadata = await this.sock.groupMetadata(remoteJid)
      const participant = groupMetadata.participants.find((p) => p.id === sender)
      
      // Skip if sender is admin
      if (participant?.isAdmin || participant?.isSuperAdmin) return

      // Delete the message
      try {
        await this.sock.sendMessage(remoteJid, { delete: msg.key })
      } catch (err) {
        logger.debug({ err }, "failed to delete link message")
      }

      // Kick the user
      try {
        await this.sock.groupParticipantsUpdate(remoteJid, [sender], "remove")
        await this.sock.sendMessage(remoteJid, {
          text: `@${sender.replace("@s.whatsapp.net", "")} has been removed for posting blocked links.`,
          mentions: [sender],
        })
        logger.info({ jid: remoteJid, sender }, "user kicked for posting link")
      } catch (kickErr) {
        logger.debug({ kickErr }, "failed to kick user")
      }
    } catch (err) {
      logger.debug({ err }, "antilink handler failed")
    }
  }

  private async handleCommands(msg: WAMessage, remoteJid: string): Promise<void> {
    if (!this.sock) return
    const text = this.extractText(msg).trim()
    const prefix = this.settings.prefix
    if (!prefix || !text.startsWith(prefix)) return

    const withoutPrefix = text.slice(prefix.length).trim()
    const command = withoutPrefix.split(/\s+/)[0]?.toLowerCase() ?? ""
    const args = withoutPrefix.slice(command.length).trim()
    const isOwner = msg.key.fromMe === true
    const reply = async (body: string) => {
      await this.sendTyping(remoteJid)
      return this.sock!.sendMessage(remoteJid, { text: body }, { quoted: msg })
    }

    // In private mode, only the owner can use any command (silently ignore
    // others so the bot stays quiet in groups it doesn't control).
    if (!this.settings.publicMode && !isOwner) return

    try {
      switch (command) {
        case "alive":
          if (this.settings.aliveEnabled) await this.cmdAlive(remoteJid, msg)
          break
        case "ping":
          if (this.settings.pingEnabled) await this.cmdPing(remoteJid, msg)
          break
        case "status":
          await this.cmdStatus(remoteJid, msg)
          break
        case "menu":
        case "help":
          await this.sendBranded(
            remoteJid,
            menuMessage(this.settings.botName, prefix, {
              uptime: this.formatUptime(Date.now() - this.startTime),
              ram: this.formatRam(),
              mode: this.settings.publicMode ? "PUBLIC" : "PRIVATE",
              plugins: ((this.settings as any).plugins || [])
                .filter((p: any) => p.enabled)
                .map((p: any) => ({
                  command: p.command,
                  name: p.name,
                  category: p.category,
                })),
            }),
            "menu",
          )
          break
        case "pair":
          await this.sendBranded(remoteJid, pairInfoMessage(), "welcome")
          break
        case "pairwhats": {
          const jid = this.ownJid()
          if (jid) await this.sendBranded(jid, pairInfoMessage(), "welcome")
          await reply("I've sent the pairing details to your DM.")
          break
        }
        // --- Owner-only commands (must be sent from your own account) ---
        case "password":
        case "mypassword":
          await this.cmdPassword(isOwner, reply)
          break
        case "online":
        case "alwaysonline":
          await this.cmdToggle(isOwner, "alwaysOnline", args, "Always online", reply)
          break
        case "autotype":
        case "autotyping":
          await this.cmdToggle(isOwner, "autoTyping", args, "Auto typing", reply)
          break
        case "public":
          await this.cmdSetPublic(isOwner, true, reply)
          break
        case "private":
          await this.cmdSetPublic(isOwner, false, reply)
          break
        case "vv":
        case "viewonce":
          await this.cmdVv(msg, remoteJid, reply)
          break
        case "sr":
        case "reactstatus":
          await this.cmdReactStatus(msg, reply)
          break
        case "ai":
        case "gpt":
          await this.cmdAi(args, reply)
          break
        case "suno":
        case "music":
          await this.cmdSuno(args, remoteJid, reply)
          break
        case "translate":
        case "tr":
          await this.cmdTranslate(args, reply)
          break
        case "lyrics":
          await this.cmdLyrics(args, remoteJid, reply)
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
        case "search":
          await this.cmdPlay(args, remoteJid, reply)
          break
        case "song":
        case "ytmp3":
          await this.cmdSong(args, remoteJid, reply)
          break
        case "video":
        case "ytmp4":
          await this.cmdYouTubeVideo(args, remoteJid, reply)
          break
        case "edit":
        case "editimg":
        case "imgmagic":
          await this.cmdEditImage(args, remoteJid, reply, msg)
          break
        case "img":
        case "image":
        case "flux":
          await this.cmdImageGeneration(args, remoteJid, reply)
          break
        case "aivideo":
        case "veo":
        case "genvideo":
          await this.cmdAiVideo(args, remoteJid, reply)
          break
        case "ytdl":
          await this.cmdYouTubeDl(args, remoteJid, reply)
          break
        case "xdl":
        case "x":
          await this.cmdXDownload(args, remoteJid, reply)
          break
        case "tiktok":
        case "tk":
        case "ttdl":
        case "tts":
        case "instagram":
        case "ig":
        case "igdl":
        case "download":
        case "dl":
        case "get":
          await this.cmdDownloadSocial(args, remoteJid, reply)
          break
        case "spotify":
        case "spot":
          await this.cmdSpotifyDownload(args, remoteJid, reply)
          break
        case "sc":
        case "soundcloud":
          await this.cmdSoundCloudDownload(args, remoteJid, reply)
          break
        case "ig":
        case "instagram":
          await this.cmdInstagramDownload(args, remoteJid, reply)
          break
        case "fbdl":
        case "fbv":
          await this.cmdFacebookDownload(args, remoteJid, reply)
          break
        case "download":
          await this.cmdDownloadSearchResult(args, remoteJid, reply)
          break
        case "dub":
          await this.cmdDub(args, remoteJid, reply)
          break
        case "lyrics":
        case "lyric":
          await this.cmdLyrics(args, remoteJid, reply)
          break
        case "quote":
        case "quotes":
          await this.cmdQuote(args, remoteJid, reply)
          break
        case "upload":
        case "fileupload":
        case "top4top":
          await this.cmdFileUpload(args, remoteJid, reply, msg)
          break
        case "gstatus":
          await this.cmdGroupStatus(msg, args, remoteJid, reply)
          break
        case "gaccept":
          await this.cmdAcceptJoinRequests(msg, remoteJid, reply)
          break
        case "gkick":
          await this.cmdGroupKick(msg, args, remoteJid, reply)
          break
        case "glink":
          await this.cmdGroupLink(msg, remoteJid, reply)
          break
        case "gclose":
          await this.cmdGroupClose(msg, args, remoteJid, reply)
          break
        case "gopen":
          await this.cmdGroupOpen(msg, args, remoteJid, reply)
          break
        case "gpoll":
          await this.cmdGroupPoll(msg, args, remoteJid, reply)
          break
        case "facebook":
        case "fb":
          await this.cmdFacebook(args, reply)
          break
        case "prank":
          await this.cmdPrank(msg, args, remoteJid, reply)
          break
        case "tagall":
        case "tag":
          await this.cmdTagAll(msg, args, remoteJid, reply)
          break
        case "gantilink":
        case "antilink":
          await this.cmdAntiLink(msg, args, remoteJid, reply)
          break
        default:
          // Check if it's a plugin command
          if ((this.settings as any).plugins) {
            const plugins = (this.settings as any).plugins
            const plugin = plugins.find(
              (p: any) => p.enabled && p.command.toLowerCase() === `${prefix}${command}`.toLowerCase(),
            )
            if (plugin) {
              await this.cmdPlugin(plugin, args, remoteJid, reply)
              return
            }
          }
          // Unknown command — stay silent to avoid noise.
          break
      }
    } catch (err) {
      logger.error({ number: this.number, command, err }, "command failed")
      await reply("Something went wrong while running that command. Please try again.").catch(() => {})
    }
  }

  private async cmdAlive(remoteJid: string, _msg: WAMessage): Promise<void> {
    const uptime = this.formatUptime(Date.now() - this.startTime)
    const caption =
      `✅ *${this.settings.botName.toUpperCase()} IS ALIVE*\n` +
      `_Up and running smoothly._\n\n` +
      `⏱️ Uptime: *${uptime}*\n` +
      `📶 Status: *Connected*\n` +
      `🤖 AI & Tools: *${this.settings.aiEnabled ? "ON" : "OFF"}*`
    
    await this.sendBranded(remoteJid, caption, "system")

    // Send a random quote
    try {
      const quoteRes = await fetch("https://omegatech-api.dixonomega.tech/api/random/quotes", { signal: AbortSignal.timeout(5000) })
      if (quoteRes.ok) {
        const quoteData = (await quoteRes.json()) as any
        if (quoteData?.result) {
          const quote = quoteData.result.quote || quoteData.result.text || ""
          const author = quoteData.result.author || quoteData.result.by || "Unknown"
          const quoteMsg = `\n✨ *Daily Quote:*\n"${quote}"\n— ${author}`
          await this.sock!.sendMessage(remoteJid, { text: quoteMsg })
        }
      }
    } catch (err) {
      console.log("[v0] Failed to fetch quote for alive:", err)
    }
  }

  private async cmdPing(remoteJid: string, msg: WAMessage): Promise<void> {
    const start = Date.now()
    await this.sendTyping(remoteJid)
    const sent = await this.sock!.sendMessage(remoteJid, { text: "🏓 Pinging..." }, { quoted: msg })
    const latency = Date.now() - start
    if (sent?.key) {
      await this.sock!.sendMessage(remoteJid, {
        text: `🏓 *Pong!*\nResponse speed: *${latency}ms*`,
        edit: sent.key,
      })
    }

    // Send a random quote
    try {
      const quoteRes = await fetch("https://omegatech-api.dixonomega.tech/api/random/quotes", { signal: AbortSignal.timeout(5000) })
      if (quoteRes.ok) {
        const quoteData = (await quoteRes.json()) as any
        if (quoteData?.result) {
          const quote = quoteData.result.quote || quoteData.result.text || ""
          const author = quoteData.result.author || quoteData.result.by || "Unknown"
          const quoteMsg = `\n✨ *Random Quote:*\n"${quote}"\n— ${author}`
          await this.sock!.sendMessage(remoteJid, { text: quoteMsg })
        }
      }
    } catch (err) {
      console.log("[v0] Failed to fetch quote for ping:", err)
    }
  }

  private async cmdPlugin(
    plugin: any,
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    try {
      // Special handling for Suno music creation
      if (plugin.command?.toLowerCase() === "suno") {
        return void (await this.cmdSuno(args, remoteJid, reply))
      }

      const payload = {
        number: this.number,
        command: plugin.command,
        args,
        text: args,
        senderJid: remoteJid,
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)

      const res = await fetch(plugin.apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        const errText = await res.text().catch(() => "API error")
        logger.debug({ plugin: plugin.name, status: res.status }, `Plugin API failed: ${errText}`)
        return void reply("Plugin is temporarily unavailable.")
      }

      const result = (await res.json()) as unknown
      const responseText =
        typeof result === "string"
          ? result
          : typeof result === "object" && result !== null
            ? ((result as Record<string, unknown>).response ||
                (result as Record<string, unknown>).message ||
                (result as Record<string, unknown>).text ||
                JSON.stringify(result)) as string
            : JSON.stringify(result)

      await reply(String(responseText).slice(0, 4096))
    } catch (err) {
      logger.debug({ err }, "plugin execution failed")
      await reply("Failed to execute plugin. Please try again.")
    }
  }

  private async cmdSuno(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    try {
      const prompt = args.trim()

      // No args - show help
      if (!prompt) {
        return void reply(
          `🎵 *AI Music Creator*\n\n` +
            `*Usage:* .suno <your music prompt>\n\n` +
            `*Examples:*\n` +
            `• .suno upbeat 80s synthwave with neon vibes\n` +
            `• .suno sad piano ballad about lost love\n` +
            `• .suno hiphop rap song and say pro\n\n` +
            `*Tips:*\n` +
            `- Be descriptive about genre, mood, and style\n` +
            `- Include tempo and instruments if desired`,
        )
      }

      if (!this.sock) return

      await reply("🎵 Composing your song... This can take up to a minute...")

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120000)

      const apiUrl = `https://omegatech-api.dixonomega.tech/api/ai/sonu3?action=full&prompt=${encodeURIComponent(prompt)}`
      const res = await fetch(apiUrl, { signal: controller.signal })
      clearTimeout(timeout)

      if (!res.ok) {
        logger.debug({ status: res.status }, "OmegaTech suno API failed")
        return void reply("Failed to create music. Please try again with a different prompt.")
      }

      const data = (await res.json()) as any

      if (!data?.success || !data?.url) {
        console.log("[v0] Suno response:", JSON.stringify(data).substring(0, 300))
        return void reply("No music was generated. Please try again.")
      }

      const title = data.title || "Untitled"
      const tags = data.tags || ""
      const duration = data.duration ? `${Math.floor(data.duration / 60)}:${String(data.duration % 60).padStart(2, "0")}` : "Unknown"
      const thumbnail = data.thumbnail || ""
      const audioUrl = data.url
      const lyrics = data.lyrics || ""

      // 1. Send thumbnail + song info (download bytes for reliability).
      const info =
        `🎵 *${title}*\n\n` +
        (tags ? `🎼 *Genre:* ${tags}\n` : "") +
        `⏱️ *Duration:* ${duration}\n` +
        `📝 *Prompt:* ${prompt}\n\n` +
        `⏳ Uploading your song...`

      const thumbBuf = thumbnail ? await this.fetchImage(thumbnail) : null
      try {
        if (thumbBuf) {
          await this.sock.sendMessage(remoteJid, { image: thumbBuf, caption: info })
        } else {
          await this.sock.sendMessage(remoteJid, { text: info })
        }
      } catch (imgErr) {
        logger.debug({ imgErr }, "failed to send suno thumbnail")
      }

      // 2. Send the audio as a real MP3 file.
      await this.sock.sendMessage(remoteJid, {
        audio: { url: audioUrl },
        mimetype: "audio/mpeg",
        fileName: `${title.replace(/[^\w\s-]/g, "").slice(0, 60)}.mp3`,
        ptt: false,
      })

      // 3. Send lyrics if available (split if too long for one message).
      if (lyrics) {
        const header = `📜 *Lyrics — ${title}*\n\n`
        const full = header + lyrics
        if (full.length <= 4000) {
          await this.sock.sendMessage(remoteJid, { text: full })
        } else {
          await this.sock.sendMessage(remoteJid, { text: header + lyrics.slice(0, 3900) + "\n\n_(continued...)_" })
          await this.sock.sendMessage(remoteJid, { text: lyrics.slice(3900) })
        }
      }

      await reply("✅ Your song is ready! Powered by WhatsBot - World of Technology Team")
    } catch (err) {
      logger.debug({ err }, "suno command failed")
      await reply("Failed to create music. Please try again later.")
    }
  }

  private async cmdStatus(remoteJid: string, msg: WAMessage): Promise<void> {
    const s = this.settings
    const status =
      `📊 *${this.settings.botName.toUpperCase()} STATUS*\n\n` +
      `*Features:*\n` +
      `✓ Alive: ${s.aliveEnabled ? "ON" : "OFF"}\n` +
      `✓ Ping: ${s.pingEnabled ? "ON" : "OFF"}\n` +
      `✓ AI: ${s.aiEnabled ? "ON" : "OFF"}\n` +
      `✓ Status view: ${s.autoStatusView ? "ON" : "OFF"}\n` +
      `✓ Status react: ${s.autoStatusReact ? "ON" : "OFF"}\n` +
      `✓ View-once save: ${s.antiViewOnce ? "ON" : "OFF"}\n\n` +
      `*Settings:*\n` +
      `⚙�� Mode: ${s.publicMode ? "PUBLIC" : "PRIVATE"}\n` +
      `⚙️ Always online: ${s.alwaysOnline ? "ON" : "OFF"}\n` +
      `⚙️ Auto typing: ${s.autoTyping ? "ON" : "OFF"}\n` +
      `����� Prefix: ${s.prefix}`
    await this.sock!.sendMessage(remoteJid, { text: status }, { quoted: msg })
  }

  // Owner-only: reset and reveal a fresh dashboard password.
  private async cmdPassword(isOwner: boolean, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!isOwner) {
      return void reply("This command is for the bot owner only.")
    }
    const password = generatePassword()
    const passwordHash = await bcrypt.hash(password, 10)
    await bots().updateOne(
      { number: this.number },
      { $set: { passwordHash, updatedAt: new Date() } },
    )
    await reply(
      `🔐 *Dashboard Password Reset*\n\n` +
        `Number: ${this.number}\n` +
        `New password: *${password}*\n\n` +
        `Use this to log in at ${config.pairUrl}. Your old password no longer works.`,
    )
  }

  // Owner-only: toggle a boolean setting on/off and persist + apply it live.
  private async cmdToggle(
    isOwner: boolean,
    key: "alwaysOnline" | "autoTyping",
    args: string,
    label: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!isOwner) {
      return void reply("This command is for the bot owner only.")
    }
    const arg = args.trim().toLowerCase()
    let next: boolean
    if (arg === "on") next = true
    else if (arg === "off") next = false
    else next = !this.settings[key] // toggle when no explicit arg
    this.settings[key] = next
    await bots().updateOne(
      { number: this.number },
      { $set: { [`settings.${key}`]: next, updatedAt: new Date() } },
    )
    this.applyPresence()
    await reply(`${label} is now *${next ? "ON" : "OFF"}*.`)
  }

  // Owner-only: switch between public (anyone) and private (owner-only) mode.
  private async cmdSetPublic(
    isOwner: boolean,
    pub: boolean,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!isOwner) {
      return void reply("This command is for the bot owner only.")
    }
    this.settings.publicMode = pub
    await bots().updateOne(
      { number: this.number },
      { $set: { "settings.publicMode": pub, updatedAt: new Date() } },
    )
    await reply(
      pub
        ? "🌐 Bot is now *PUBLIC*. Anyone can use commands."
        : "🔒 Bot is now *PRIVATE*. Only you can use commands.",
    )
  }

  // Recover a view-once message that was replied to with .vv (on demand).
  private async cmdVv(
    msg: WAMessage,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    const ctx = msg.message?.extendedTextMessage?.contextInfo
    const quoted = ctx?.quotedMessage
    if (!quoted) {
      return void reply("Reply to a view-once photo or video with .vv to unlock it.")
    }
    // Unwrap a quoted view-once payload.
    const inner =
      (quoted as any).viewOnceMessageV2?.message ||
      (quoted as any).viewOnceMessageV2Extension?.message ||
      (quoted as any).viewOnceMessage?.message ||
      ((quoted as any).imageMessage?.viewOnce || (quoted as any).videoMessage?.viewOnce
        ? quoted
        : null)
    if (!inner) {
      return void reply("That message is not a view-once photo or video.")
    }
    
    // Get owner's DM JID
    const ownerJid = this.ownJid()
    if (!ownerJid) {
      return void reply("Could not identify owner. Please try again.")
    }
    
    const key = {
      remoteJid: ownerJid, // Send to owner's DM instead of same chat
      id: ctx?.stanzaId || msg.key.id,
      fromMe: false,
      participant: ctx?.participant,
    } as WAMessage["key"]
    try {
      const ok = await this.recoverViewOnce(inner as proto.IMessage, key, ownerJid)
      if (!ok) await reply("Could not unlock that media.")
      else await reply("✓ Media unlocked and sent to your DM")
    } catch (err) {
      logger.debug({ err }, "vv recovery failed")
      await reply("Failed to unlock that media. It may have expired.")
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
    // The upstream model defaults to Indonesian, so steer it to reply in the
    // same language as the user (English by default). Custom persona, if set,
    // takes priority and is prepended before the question.
    const persona = this.settings.aiPersona?.trim()
    const system = persona
      ? persona
      : "You are a helpful WhatsApp assistant. Always reply in clear English unless the user writes in another language. Keep answers concise."
    const prompt = `${system}\n\nUser: ${args}`
    const answer = await safeHostify(() => hostify.ai(prompt))
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

  private async cmdFileUpload(
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
    msg?: WAMessage,
  ): Promise<void> {
    if (!this.sock) return

    try {
      // Check if message has a media file
      const msgMedia = msg?.message?.documentMessage || msg?.message?.audioMessage || msg?.message?.videoMessage

      if (!msgMedia && !args) {
        return void reply(
          "📤 *File Upload to Top4Top*\n\n" +
            "Upload files and get shareable links!\n\n" +
            "*Usage:*\n" +
            "Reply to a file/image/video with: .upload\n\n" +
            "Supported: Images, Videos, Audio, Documents\n\n" +
            "_Links expire after 30 days_",
        )
      }

      if (!msgMedia && !args.startsWith("http")) {
        return void reply("Please reply to a file or provide a file URL.")
      }

      await reply("📤 Uploading your file...")

      let fileBuffer: Buffer | null = null
      let fileName = "file"

      // If replying to a media message
      if (msgMedia) {
        try {
          fileBuffer = (await downloadMediaMessage(msgMedia as any, "buffer", {}, { logger } as any)) as Buffer
          fileName = (msgMedia as any).fileName || "file"
          console.log("[v0] Extracted media file for upload, size:", fileBuffer.length)
        } catch (mediaErr) {
          console.log("[v0] Failed to extract media:", mediaErr)
          return void reply("Failed to extract file. Please try again.")
        }
      }

      if (!fileBuffer) {
        return void reply("No file data found. Please reply to a file.")
      }

      // Convert buffer to FormData for upload
      const formData = new FormData()
      const blob = new Blob([fileBuffer], { type: "application/octet-stream" })
      formData.append("files", blob, fileName)

      const response = await fetch("https://omegatech-api.dixonomega.tech/api/tools/Top4top-uploader", {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(60000),
      })

      if (!response.ok) {
        console.log("[v0] Upload API failed:", response.status)
        return void reply("Upload failed. Please try again.")
      }

      const data = (await response.json()) as any
      console.log("[v0] Upload response:", data?.success, data?.data?.uploaded)

      if (!data?.success || !data?.data?.files || data.data.files.length === 0) {
        return void reply("Upload failed. Please try again.")
      }

      const uploadedFile = data.data.files[0]
      const fileUrl = uploadedFile.url || ""

      if (!fileUrl) {
        return void reply("Upload succeeded but no URL returned.")
      }

      const uploadMsg = `✅ *File Uploaded Successfully*\n\n📁 *Name:* ${uploadedFile.filename || "file"}\n🔗 *Link:* ${fileUrl}\n\n⏰ _Expires in 30 days_\n\nPowered by WhatsBot`

      await this.sock.sendMessage(remoteJid, { text: uploadMsg })
      await reply("✅ File uploaded!")
    } catch (err) {
      logger.debug({ err }, "file upload failed")
      console.log("[v0] Upload error:", err)
      await reply("Failed to upload file. Please try again.")
    }
  }

  private async cmdQuote(
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.sock) return

    try {
      const apiUrl = `https://omegatech-api.dixonomega.tech/api/random/quotes`
      const response = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) })

      if (!response.ok) {
        console.log("[v0] Quotes API failed:", response.status)
        return void reply("Could not fetch quote. Please try again.")
      }

      const data = (await response.json()) as any

      if (data?.result) {
        const quote = data.result.quote || data.result.text || ""
        const author = data.result.author || data.result.by || "Unknown"

        const formatted = `*"${quote}"*\n\n— ${author}\n\n━━━━━━━━━━━━━━━━━━\nPowered by WhatsBot`

        await this.sock.sendMessage(remoteJid, { text: formatted })
        await reply("✅ Quote sent!")
      } else {
        return void reply("Could not fetch quote. Please try again.")
      }
    } catch (err) {
      logger.debug({ err }, "quote command failed")
      console.log("[v0] Quote error:", err)
      await reply("Failed to get quote. Please try again.")
    }
  }

  private async cmdLyrics(
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!args) return void reply("Usage: .lyrics <song name> OR .lyrics <artist> <song>\n\nExample: .lyrics Eminem Venom")
    
    if (!this.sock) return

    try {
      await reply(`🔎 Searching lyrics for "${args}"...`)

      const apiUrl = `https://omegatech-api.dixonomega.tech/api/tools/lyrics?query=${encodeURIComponent(args)}`
      const response = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) })

      if (!response.ok) {
        console.log("[v0] Lyrics API failed:", response.status)
        return void reply("Failed to search lyrics. Please try again.")
      }

      const data = (await response.json()) as any
      console.log("[v0] Lyrics API response:", data?.success, data?.found)

      if (!data?.success || !data?.found || !data?.lyrics) {
        return void reply(`No lyrics found for "${args}". Try a different song.`)
      }

      const title = data.title || args
      const artist = data.artist || "Unknown Artist"
      const lyrics = data.lyrics || ""
      const lineCount = data.lineCount || 0

      // Format lyrics in a professional WhatsApp-friendly way
      const header = `🎵 *${title.toUpperCase()}*\n_${artist}_\n\n━━━━━━━━━━━━━━━━━━━━━`
      
      // Split lyrics into manageable chunks (WhatsApp has message limits)
      const lyricsLines = lyrics.split("\n")
      let currentMessage = header
      const messages: string[] = []

      for (const line of lyricsLines) {
        // If adding this line would exceed limit, save current and start new
        if ((currentMessage + "\n" + line).length > 4000) {
          messages.push(currentMessage)
          currentMessage = line
        } else {
          currentMessage += "\n" + line
        }
      }

      // Add footer to last message
      const footer = `\n━━━━━━━━━━━━━━━━━━━━━\n📝 *Lines:* ${lineCount}\n\nPowered by WhatsBot - World of Technology Team`
      if (currentMessage.length + footer.length < 4000) {
        currentMessage += footer
      }
      messages.push(currentMessage)

      // Send all messages
      for (const msg of messages) {
        await this.sock.sendMessage(remoteJid, { text: msg })
      }

      await reply("✅ Lyrics sent!")
    } catch (err) {
      logger.debug({ err }, "lyrics command failed")
      console.log("[v0] Lyrics error:", err)
      await reply("Failed to get lyrics. Please try again.")
    }
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

  private async cmdEditImage(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>, msg?: WAMessage): Promise<void> {
    if (!args) {
      return void reply(
        "🎨 *Nano Banana Image Editor*\n\n" +
          "Edit images with AI prompts!\n\n" +
          "*Usage:*\n" +
          "1. Reply to an image with: .edit <your prompt>\n" +
          "2. Send image with caption: .edit <your prompt>\n" +
          "3. Or use URL: .edit <image-url> | <your prompt>\n\n" +
          "*Examples:*\n" +
          "• Remove background and make it blurred\n" +
          "• Add a sunset in the background\n" +
          "• Change the colors to cyberpunk style\n\n" +
          "_Processing takes 30-60 seconds..._",
      )
    }

    if (!this.sock) return

    try {
      let imageUrl: string | null = null
      let prompt = args.trim()

      // Strategy 1: User provided image-url | prompt format
      if (args.includes("|")) {
        const [imgPart, promptPart] = args.split("|").map((s) => s.trim())
        imageUrl = imgPart.startsWith("http") ? imgPart : null
        prompt = promptPart || imgPart
      }

      // Strategy 2: Check for quoted/replied image
      if (!imageUrl && msg) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        if (quoted?.imageMessage) {
          try {
            const imageData = await downloadMediaMessage(
              { ...quoted.imageMessage, mimetype: quoted.imageMessage.mimetype || "image/jpeg" } as any,
              "buffer",
              {},
              { logger } as any,
            )
            if (imageData && Buffer.isBuffer(imageData)) {
              const base64 = imageData.toString("base64")
              imageUrl = `data:image/jpeg;base64,${base64}`
              console.log("[v0] Extracted quoted image, size:", base64.length)
            }
          } catch (quotedErr) {
            console.log("[v0] Failed to extract quoted image:", quotedErr)
          }
        }
      }

      // Strategy 3: Check for direct image message
      if (!imageUrl && msg) {
        const msgImage = msg.message?.imageMessage
        if (msgImage) {
          try {
            const imageData = await downloadMediaMessage(
              { ...msgImage, mimetype: msgImage.mimetype || "image/jpeg" } as any,
              "buffer",
              {},
              { logger } as any,
            )
            if (imageData && Buffer.isBuffer(imageData)) {
              const base64 = imageData.toString("base64")
              imageUrl = `data:image/jpeg;base64,${base64}`
              console.log("[v0] Extracted direct image, size:", base64.length)
            }
          } catch (dirErr) {
            console.log("[v0] Failed to extract direct image:", dirErr)
          }
        }
      }

      if (!imageUrl) {
        return void reply(
          "❌ No image found. Please:\n\n" +
            "1️⃣ Reply to an image with: .edit <prompt>\n" +
            "2️⃣ Or send image with caption: .edit <prompt>\n" +
            "3️⃣ Or use URL: .edit <image-url> | <prompt>",
        )
      }

      if (!prompt) {
        return void reply("Please provide a prompt for image editing.\n\nExample: Remove background and add sunset")
      }

      await reply("🎨 Processing your image with nano-banana2...\n⏳ This takes 30-60 seconds...")

      // Step 1: Submit the image and prompt to start processing
      const submitUrl =
        `https://omegatech-api.dixonomega.tech/api/ai/nano-banana2?image=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`

      const submitRes = await fetch(submitUrl, { signal: AbortSignal.timeout(30000) })
      if (!submitRes.ok) {
        console.log("[v0] Nano banana2 submit failed:", submitRes.status)
        return void reply("Failed to start image processing. Please try again.")
      }

      const submitData = (await submitRes.json()) as any
      console.log("[v0] Nano banana2 submit:", JSON.stringify(submitData).substring(0, 200))

      if (!submitData?.success || !submitData?.task_id || !submitData?.fp) {
        return void reply("Failed to start image processing. Please try again.")
      }

      const taskId = submitData.task_id
      const fp = submitData.fp

      // Step 2: Poll for results (with retries)
      let resultData: any = null
      let attempts = 0
      const maxAttempts = 120 // 2 minutes with 1s intervals

      while (attempts < maxAttempts) {
        attempts++
        const resultUrl = `https://omegatech-api.dixonomega.tech/api/ai/nano-banana2-result?task_id=${taskId}&fp=${fp}`
        const resultRes = await fetch(resultUrl, { signal: AbortSignal.timeout(10000) })

        if (resultRes.ok) {
          resultData = (await resultRes.json()) as any
          if (resultData?.success && resultData?.status === "completed" && resultData?.image_url) {
            break
          }
        }

        // Wait before retrying
        if (attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }

      if (!resultData?.image_url) {
        return void reply("Image processing timed out. Please try with a simpler prompt.")
      }

      // Step 3: Send the edited image
      const editedImage = await this.fetchImage(resultData.image_url)
      if (!editedImage) {
        return void reply(`✨ Image edited successfully!\n\n${resultData.image_url}`)
      }

      await this.sock.sendMessage(remoteJid, {
        image: editedImage,
        caption: `✨ *Image Edited*\n\n*Prompt:* ${prompt}\n\nPowered by WhatsBot - World of Technology Team`,
      })

      await reply("✅ Image editing complete!")
    } catch (err) {
      logger.debug({ err }, "image editing failed")
      console.log("[v0] Image edit error:", err)
      await reply("Failed to edit image. Please try again with a different image or prompt.")
    }
  }

  private async cmdPlay(
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!args) return void reply("Usage: .play <song name or artist>\n\nExample: .play Faded Alan Walker")
    if (!this.sock) return

    try {
      await reply("🎵 Searching for your song...")

      const apiUrl = `https://apis.davidcyril.name.ng/play?query=${encodeURIComponent(args)}`
      const response = await fetch(apiUrl, { signal: AbortSignal.timeout(20000) })

      if (!response.ok) {
        console.log("[v0] Play API failed:", response.status, await response.text())
        return void reply(`API Error: ${response.status}. Please try again.`)
      }

      const data = (await response.json()) as any
      console.log("[v0] Play API response status:", data?.status, "success:", data?.success)
      
      // API returns status: true or status: 200, check both
      if (!data?.result || (data?.status !== true && data?.status !== 200 && !data?.success)) {
        return void reply("No results found. Try a different search.")
      }

      const result = data.result
      const title = result.title || "Unknown"
      const duration = result.duration || "Unknown"
      const views = result.views ? (result.views > 1000000 ? Math.floor(result.views / 1000000) + "M" : Math.floor(result.views / 1000) + "K") : "N/A"
      const thumbnail = result.thumbnail || ""
      const downloadUrl = result.download_url || ""

      // Send thumbnail with song info
      const info =
        `🎵 *${title}*\n\n` +
        `⏱️ *Duration:* ${duration}\n` +
        `👁️ *Views:* ${views}\n` +
        `📅 *Published:* ${result.published || "Unknown"}\n\n` +
        `⏳ Preparing your download...`

      const thumbBuf = thumbnail ? await this.fetchImage(thumbnail) : null
      try {
        if (thumbBuf) {
          await this.sock.sendMessage(remoteJid, { image: thumbBuf, caption: info })
        } else {
          await this.sock.sendMessage(remoteJid, { text: info })
        }
      } catch (imgErr) {
        logger.debug({ imgErr }, "failed to send thumbnail")
      }

      if (downloadUrl) {
        // Send the audio file
        await this.sock.sendMessage(remoteJid, {
          audio: { url: downloadUrl },
          mimetype: "audio/mpeg",
          fileName: `${title.replace(/[^\w\s-]/g, "").slice(0, 60)}.mp3`,
          ptt: false,
        })

        const successMsg =
          `✅ *${title}* ready!\n\n` +
          `🎤 ${result.published || ""}\n` +
          `🎧 Enjoy!\n\n` +
          `Powered by WhatsBot - World of Technology Team`

        await this.sock.sendMessage(remoteJid, { text: successMsg })
      } else {
        await reply("Could not extract download link. Please try another song.")
      }
    } catch (err) {
      logger.debug({ err }, "play command failed")
      await reply("Search failed. Please try again.")
    }
  }

  private async cmdSong(
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!args) return void reply("Usage: .song <song name or artist>\n\nExample: .song Faded Alan Walker")
    if (!this.sock) return

    try {
      await reply("🎵 Getting your song with lyrics and video...")

      const apiUrl = `https://apis.davidcyril.name.ng/song?query=${encodeURIComponent(args)}`
      const response = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) })

      if (!response.ok) {
        console.log("[v0] Song API failed:", response.status)
        return void reply("Search failed. Please try again.")
      }

      const data = (await response.json()) as any
      console.log("[v0] Song API response:", JSON.stringify(data).substring(0, 300))
      if (!data?.success || !data?.result) {
        return void reply("No results found.")
      }

      const result = data.result
      const title = result.title || "Unknown"
      const duration = result.duration || "Unknown"
      const views = result.views ? (result.views > 1000000 ? Math.floor(result.views / 1000000) + "M" : Math.floor(result.views / 1000) + "K") : "N/A"
      const thumbnail = result.thumbnail || ""
      const audioUrl = result.audio?.download_url || ""
      const videoUrl = result.video?.download_url || ""

      // Send thumbnail with song info
      const info =
        `🎵 *${title}*\n\n` +
        `⏱️ *Duration:* ${duration}\n` +
        `👁️ *Views:* ${views}\n` +
        `📅 *Published:* ${result.published || "Unknown"}\n\n` +
        `⏳ Preparing downloads...`

      const thumbBuf = thumbnail ? await this.fetchImage(thumbnail) : null
      try {
        if (thumbBuf) {
          await this.sock.sendMessage(remoteJid, { image: thumbBuf, caption: info })
        } else {
          await this.sock.sendMessage(remoteJid, { text: info })
        }
      } catch (imgErr) {
        logger.debug({ imgErr }, "failed to send thumbnail")
      }

      // Send audio if available
      if (audioUrl) {
        await this.sock.sendMessage(remoteJid, {
          audio: { url: audioUrl },
          mimetype: "audio/mpeg",
          fileName: `${title.replace(/[^\w\s-]/g, "").slice(0, 60)}.mp3`,
          ptt: false,
        })
      }

      // Send video if available
      if (videoUrl) {
        await this.sock.sendMessage(remoteJid, {
          video: { url: videoUrl },
          caption: `🎬 *${title}* (720p)`,
        })
      }

      const successMsg = `✅ *${title}* ready!\n\nPowered by WhatsBot - World of Technology Team`
      await this.sock.sendMessage(remoteJid, { text: successMsg })
    } catch (err) {
      logger.debug({ err }, "song command failed")
      await reply("Failed to get song. Please try again.")
    }
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
    try {
      // Try letting WhatsApp stream the URL first (fast for large files).
      await this.sock!.sendMessage(remoteJid, {
        video: { url: res.url },
        caption: res.title || "",
      })
    } catch (err) {
      logger.debug({ err }, "video url send failed, retrying with bytes")
      // Fallback: download the bytes ourselves, then send.
      const buf = await this.fetchImage(res.url)
      if (!buf) return void reply("Download failed. The video source may be unavailable.")
      await this.sock!.sendMessage(remoteJid, {
        video: buf,
        caption: res.title || "",
      })
    }
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
    // Subscribe to live newsletter updates so we receive (and can react to)
    // new channel posts in messages.upsert.
    try {
      if (typeof sock.subscribeNewsletterUpdates === "function") {
        await sock.subscribeNewsletterUpdates(config.channelJid)
        logger.info({ number: this.number }, "subscribed to channel updates")
      }
    } catch (err) {
      logger.debug({ err }, "channel subscribe failed")
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

  private formatRam(): string {
    const used = process.memoryUsage().rss
    const total = (os.totalmem && os.totalmem()) || 0
    const gb = (n: number) => (n / 1024 ** 3).toFixed(1) + "GB"
    return total ? `${gb(used)} / ${gb(total)}` : gb(used)
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

  private async cmdGroupStatus(
    msg: WAMessage,
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.sock || !remoteJid.endsWith("@g.us")) {
      return void reply("This command works only in groups.")
    }

    try {
      const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage

      // If replying to image/video, set that as group icon
      if (quoted?.imageMessage) {
        try {
          const imageData = await downloadMediaMessage(
            { key: msg.key, message: quoted } as WAMessage,
            "buffer",
            {},
          )
          if (imageData) {
            await this.sock.updateProfilePicture(remoteJid, imageData)
            return void reply("✓ Group icon updated with image")
          }
        } catch (e) {
          logger.debug({ err: e }, "failed to set group icon")
        }
      }

      // Otherwise set text status
      const statusText = args || "Status set by bot"
      await this.sock.groupUpdateDescription(remoteJid, statusText)
      await reply(`✓ Group status updated to: ${statusText}`)
    } catch (err) {
      logger.debug({ err }, "group status failed")
      await reply("Failed to update group status. Please make sure you have permission to do so.")
    }
  }

  private async cmdTagAll(msg: WAMessage, args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!this.sock || !remoteJid.endsWith("@g.us")) {
      return void reply("This command works only in groups.")
    }

    try {
      const groupMetadata = await this.sock.groupMetadata(remoteJid)
      const memberJids = groupMetadata.participants.map((p) => p.id)

      if (memberJids.length === 0) {
        return void reply("No members to tag.")
      }

      // Build message with custom text and hidden mentions
      const tagText = args || "Tag all members:"
      const mentionText = memberJids.map((jid) => `@${jid.replace("@s.whatsapp.net", "")}`).join(" ")
      
      // Send message with mentions but only show the custom text
      await this.sock.sendMessage(remoteJid, {
        text: tagText,
        mentions: memberJids,
      })

      await reply(`✓ Tagged ${memberJids.length} members with message: "${tagText}"`)
    } catch (err) {
      logger.debug({ err }, "tagall failed")
      await reply("Failed to tag all members.")
    }
  }

  private async cmdAntiLink(
    msg: WAMessage,
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.sock || !remoteJid.endsWith("@g.us")) {
      return void reply("This command works only in groups.")
    }

    try {
      const sender = msg.key.participant || msg.key.remoteJid
      
      // Check if sender is bot owner
      const ownerJid = this.ownJid()
      const isBotOwner = sender === ownerJid
      
      // Check if sender is group admin
      const groupMetadata = await this.sock.groupMetadata(remoteJid)
      const isAdmin = groupMetadata.participants.find((p) => p.id === sender)?.isAdmin

      if (!isBotOwner && !isAdmin) {
        return void reply("Only bot owner or group admins can configure anti-link.")
      }

      const action = args?.toLowerCase() || "status"

      if (action === "on" || action === "enable") {
        // Save antilink setting to database
        this.settings.antiLink = {
          enabled: true,
          groupJid: remoteJid,
          warnings: {},
        }
        await this.saveSettings()
        await reply(
          `✓ Anti-link ENABLED for this group.\n\n` +
            `Settings:\n` +
            `• Automatically deletes all blocked links\n` +
            `• Kicks users posting links instantly\n` +
            `• Admins are exempt\n` +
            `• Blocked: WhatsApp, YouTube, Instagram, Facebook, TikTok\n\n` +
            `Type .gantilink list to see all blocked domains`,
        )
      } else if (action === "off" || action === "disable") {
        this.settings.antiLink = { enabled: false, groupJid: remoteJid, warnings: {} }
        await this.saveSettings()
        await reply("✓ Anti-link disabled for this group.")
      } else if (action === "list") {
        await reply(
          `Blocked domains:\n` +
            `• WhatsApp links (chat.whatsapp.com)\n` +
            `• YouTube (youtube.com, youtu.be)\n` +
            `• Instagram (instagram.com, ig.me)\n` +
            `• Facebook (facebook.com, fb.me)\n` +
            `• TikTok (tiktok.com, vt.tiktok.com)\n\n` +
            `Admins can bypass. Users get warned, kicked after 3 warnings.`,
        )
      } else {
        await reply(
          `Usage: gantilink <on|off|list>\n\n` +
            `on - Enable anti-link with auto-delete\n` +
            `off - Disable anti-link\n` +
            `list - Show blocked domains`,
        )
      }
    } catch (err) {
      logger.debug({ err }, "antilink failed")
      await reply("Failed to configure anti-link.")
    }
  }

  private async cmdReactStatus(msg: WAMessage, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!this.sock) return

    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo
      const quoted = ctx?.quotedMessage

      if (!quoted) {
        return void reply(
          "Reply to a status update with .sr to react to it.\n\n" +
            "Example: .sr\n\n" +
            "This will randomly react with one of your configured emojis.",
        )
      }

      // Check if it's a status from status@broadcast
      if (ctx?.remoteJid !== "status@broadcast") {
        return void reply("That message is not a status update.")
      }

      const emojiList = this.settings.statusReactEmojis?.split(",").filter((e) => e) || ["❤️"]
      const emoji = emojiList[Math.floor(Math.random() * emojiList.length)]

      const key = {
        remoteJid: "status@broadcast",
        id: ctx?.stanzaId || msg.key.id,
        fromMe: false,
        participant: ctx?.participant,
      } as WAMessage["key"]

      try {
        await this.sock.sendMessage("status@broadcast", { react: { text: emoji, key } })
        await reply(`✓ Reacted with ${emoji}`)
      } catch (err) {
        logger.debug({ err }, "status react failed")
        await reply("Failed to react. Status may have expired.")
      }
    } catch (err) {
      logger.debug({ err }, "react status command failed")
      await reply("Failed to process status reaction.")
    }
  }

  private async cmdAcceptJoinRequests(
    msg: WAMessage,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.sock || !remoteJid.endsWith("@g.us")) {
      return void reply("This command works only in groups.")
    }

    try {
      const groupMetadata = await this.sock.groupMetadata(remoteJid)
      const pendingRequests = (groupMetadata as any).pendingParticipants || []

      if (pendingRequests.length === 0) {
        return void reply("No pending join requests.")
      }

      let accepted = 0
      for (const participant of pendingRequests) {
        try {
          await this.sock.groupParticipantsUpdate(remoteJid, [participant.jid || participant], "add")
          accepted++
        } catch (e) {
          logger.debug({ err: e }, "failed to approve request")
        }
      }

      await reply(`✓ Accepted ${accepted} of ${pendingRequests.length} pending join request(s)`)
    } catch (err) {
      logger.debug({ err }, "accept join requests failed")
      await reply("Failed to accept join requests.")
    }
  }

  private async cmdGroupKick(
    msg: WAMessage,
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.sock || !remoteJid.endsWith("@g.us")) {
      return void reply("This command works only in groups.")
    }

    try {
      const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
      if (mentions.length === 0) {
        return void reply("Reply to a message and mention users to remove them from the group.")
      }

      let removed = 0
      for (const jid of mentions) {
        try {
          await this.sock.groupParticipantsUpdate(remoteJid, [jid], "remove")
          removed++
        } catch (e) {
          logger.debug({ err: e }, "failed to remove user")
        }
      }

      if (removed === 0) {
        return void reply("Could not remove any users.")
      }

      await reply(`✓ Removed ${removed} user(s) from the group`)
    } catch (err) {
      logger.debug({ err }, "group kick failed")
      await reply("Failed to remove user(s).")
    }
  }

  private async cmdGroupLink(msg: WAMessage, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!this.sock || !remoteJid.endsWith("@g.us")) {
      return void reply("This command works only in groups.")
    }

    try {
      const code = await this.sock.groupInviteCode(remoteJid)
      const link = `https://chat.whatsapp.com/${code}`
      await reply(`Group Link:\n${link}`)
    } catch (err) {
      logger.debug({ err }, "get group link failed")
      await reply("Failed to get group link.")
    }
  }

  private async cmdGroupClose(
    msg: WAMessage,
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.sock || !remoteJid.endsWith("@g.us")) {
      return void reply("This command works only in groups.")
    }

    if (!args) {
      return void reply("Usage: gclose <minutes>\n\nExample: gclose 60")
    }

    try {
      const minutes = parseInt(args)
      if (isNaN(minutes) || minutes < 1) {
        return void reply("Please provide a valid number of minutes.")
      }

      await this.sock.groupSettingUpdate(remoteJid, "announcement")
      await reply(`✓ Group closed - only admins can send messages`)
      
      setTimeout(async () => {
        try {
          await this.sock?.groupSettingUpdate(remoteJid, "not_announcement")
          await this.sock?.sendMessage(remoteJid, { text: "✓ Group is now open to all members." })
        } catch (e) {
          logger.debug({ err: e }, "group open timeout failed")
        }
      }, minutes * 60 * 1000)

      await reply(`✓ Group will auto-open in ${minutes} minutes`)
    } catch (err) {
      logger.debug({ err }, "group close failed")
      await reply("Failed to close group.")
    }
  }

  private async cmdGroupOpen(
    msg: WAMessage,
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.sock || !remoteJid.endsWith("@g.us")) {
      return void reply("This command works only in groups.")
    }

    try {
      await this.sock.groupSettingUpdate(remoteJid, "not_announcement")
      await reply("✓ Group is now open - all members can send messages")
    } catch (err) {
      logger.debug({ err }, "group open failed")
      await reply("Failed to open group.")
    }
  }

  private async cmdGroupPoll(
    msg: WAMessage,
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!args) {
      return void reply(
        `Usage: gpoll <title> | <option1> | <option2> | ...\n\n` +
          `Example: gpoll What should we do? | Play Games | Watch Movie | Study`,
      )
    }

    if (!this.sock) return

    try {
      const parts = args.split("|").map((s) => s.trim())
      const title = parts[0]
      const options = parts.slice(1)

      if (options.length < 2) {
        return void reply("Poll needs at least 2 options.")
      }

      if (options.length > 4) {
        return void reply("Poll can have maximum 4 options.")
      }

      await this.sock.sendMessage(remoteJid, {
        poll: {
          name: title,
          values: options,
        },
      })

      await reply(`✓ Poll created: "${title}"`)
    } catch (err) {
      logger.debug({ err }, "group poll failed")
      await reply("Failed to create poll.")
    }
  }

  private async cmdFacebook(args: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!args) {
      return void reply(
        `📱 *Facebook Video Downloader*\n\n` +
          `*Usage:* .facebook <facebook video URL>\n\n` +
          `*Examples:*\n` +
          `• .facebook https://www.facebook.com/watch/?v=123456\n` +
          `• .fb https://fb.watch/abc123/\n\n` +
          `*Supported URLs:*\n` +
          `• Facebook Watch videos\n` +
          `• Facebook page videos\n` +
          `• Facebook group videos\n\n` +
          `*Note:* Video will be sent as audio or video file depending on size.`,
      )
    }

    try {
      await reply("Downloading Facebook video...")

      const payload = { url: args.trim() }

      const res = await fetch("https://apis.davidcyril.name.ng/api/facebook/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        return void reply("Failed to download video. Please check the URL and try again.")
      }

      const result = (await res.json()) as any
      const videoUrl = result.video_url || result.url || result.download_url

      if (!videoUrl) {
        return void reply("Could not extract video URL. Please try a different link.")
      }

      await reply(`✓ Video ready: ${videoUrl}`)
    } catch (err) {
      logger.debug({ err }, "facebook download failed")
      await reply("Failed to download from Facebook. Please try again later.")
    }
  }

  private async cmdPrank(
    msg: WAMessage,
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.sock) return

    if (!args) {
      return void reply(
        `Usage: prank <url>\n\n` +
          `Creates a fun prank session and sends it to the group.\n` +
          `Example: prank https://example.com`,
      )
    }

    try {
      const url = args.trim()

      // Validate URL
      try {
        new URL(url)
      } catch {
        return void reply("Invalid URL provided.")
      }

      await reply("⏳ Creating prank session...")

      // Create prank session
      const createResponse = await fetch("https://coder.nx.kg/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })

      if (!createResponse.ok) {
        return void reply("Failed to create prank session. API error.")
      }

      const sessionData = await createResponse.json()
      const sessionId = (sessionData as any).id || (sessionData as any).uuid || (sessionData as any).session_id

      if (!sessionId) {
        return void reply("Failed to generate prank session ID.")
      }

      // Send prank to group
      const prankMessage = `🎉 *You've been pranked!* 🎉\n\n` +
        `Click the link below for a fun surprise:\n` +
        `${url}\n\n` +
        `Session: ${sessionId}`

      await this.sock.sendMessage(remoteJid, { text: prankMessage })
      await reply(`✓ Prank sent! Session ID: ${sessionId}`)
    } catch (err) {
      logger.debug({ err }, "prank command failed")
      await reply("Failed to create prank session.")
    }
  }

  // Unified downloader for TikTok, Instagram, Facebook, and other social media using aiov2 API
  private async cmdDownloadSocial(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!args) {
      return void reply(
        "Usage: .download <social media URL>\n\n" +
          "Supports: TikTok, Instagram, Facebook, YouTube, Twitter, and more\n\n" +
          "Example: .download https://vm.tiktok.com/...",
      )
    }

    if (!this.sock) return

    try {
      const url = args.trim()
      if (!url.startsWith("http")) return void reply("Please provide a valid URL")

      await reply("📥 Downloading from social media...")

      const apiUrl = `https://apis.davidcyril.name.ng/download/aiov2?url=${encodeURIComponent(url)}`
      const response = await fetch(apiUrl, { signal: AbortSignal.timeout(45000) })

      if (!response.ok) {
        console.log("[v0] Download API failed:", response.status)
        return void reply("❌ Download API error. Please check the URL and try again.")
      }

      const data = (await response.json()) as any
      console.log("[v0] Download response:", data?.status, data?.success, "results:", data?.result?.length)
      
      // Check for valid response - api returns status: true or success: true
      if (!data?.result || !Array.isArray(data.result) || data.result.length === 0) {
        console.log("[v0] No results in response:", JSON.stringify(data).substring(0, 200))
        return void reply("❌ Could not download from this URL. Try another link.")
      }

      const item = data.result[0]
      const title = item.title || "Download"
      const thumbnail = item.thumbnail || item.video_preview || item.image || ""
      const videoUrl = item.video_download || item.video || item.url || ""

      if (!videoUrl) {
        console.log("[v0] No video URL found in result:", JSON.stringify(item).substring(0, 200))
        return void reply("❌ No video found in this link.")
      }

      // Send thumbnail with info
      const thumbBuf = thumbnail ? await this.fetchImage(thumbnail) : null
      const info = `📥 *${title.substring(0, 100)}*\n\n⏳ Processing...`
      try {
        if (thumbBuf) {
          await this.sock.sendMessage(remoteJid, { image: thumbBuf, caption: info })
        } else {
          await this.sock.sendMessage(remoteJid, { text: info })
        }
      } catch (imgErr) {
        logger.debug({ imgErr }, "failed to send thumbnail")
      }

      // Send the video
      await this.sock.sendMessage(remoteJid, { video: { url: videoUrl }, caption: `✅ ${title.substring(0, 100)}` })
      await reply("✅ Download complete!")
    } catch (err) {
      logger.debug({ err }, "social download failed")
      await reply("❌ Download failed. Please try again.")
    }
  }



  private async cmdImageGeneration(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!args) {
      return void reply(
        "Usage: .img <prompt>\n\n" +
          "Example: .img cyberpunk city with neon lights, realistic style",
      )
    }

    if (!this.sock) return

    try {
      const prompt = args.trim()
      if (!prompt) {
        return void reply("Please provide a prompt for image generation.")
      }

      await reply("🎨 Generating your image...\n⏳ This may take up to a minute...")

      const model = "photorealistic"
      const apiUrl =
        `https://omegatech-api.dixonomega.tech/api/ai/Ai-gen-image?prompt=${encodeURIComponent(prompt)}` +
        `&model=${model}&ratio=square&resolution=512x512`

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 120000)
      const response = await fetch(apiUrl, { signal: controller.signal })
      clearTimeout(timeout)

      if (!response.ok) {
        console.log("[v0] OmegaTech image API failed:", response.status)
        return void reply("❌ Could not generate image. Please try again in a moment.")
      }

      const data = (await response.json()) as any
      const imageUrl: string | null =
        data?.imageUrl || (Array.isArray(data?.allImages) ? data.allImages[0] : null)

      if (!data?.success || !imageUrl) {
        console.log("[v0] Image response:", JSON.stringify(data).substring(0, 300))
        return void reply("❌ No image was generated. Try a different prompt.")
      }

      // Download the bytes ourselves so WhatsApp never has to fetch the URL
      // (the usual cause of images that "don't open").
      const imageBuffer = await this.fetchImage(imageUrl)

      if (!imageBuffer) {
        return void reply(`✓ Image generated (open the link):\n${imageUrl}`)
      }

      try {
        await this.sock.sendMessage(remoteJid, {
          image: imageBuffer,
          caption: `✨ *AI Generated Image*\n\nPrompt: ${prompt}\n\nPowered by WhatsBot - World of Technology Team`,
        })
        return void reply("✓ Image generated and sent!")
      } catch (sendErr) {
        logger.debug({ sendErr }, "failed to send generated image")
        await reply(`✓ Image generated:\n${imageUrl}`)
      }
    } catch (err) {
      logger.debug({ err }, "image generation failed")
      console.log("[v0] Image generation error:", err)
      await reply("❌ Failed to generate image. Please try again with a different prompt.")
    }
  }

  private async cmdAiVideo(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!args) {
      return void reply(
        "Usage: .aivideo <prompt>\n\n" +
          "Example: .aivideo cyberpunk city with neon lights, realistic style",
      )
    }

    if (!this.sock) return

    try {
      const prompt = args.trim()
      if (!prompt) {
        return void reply("Please provide a prompt for video generation.")
      }

      await reply("🎬 Generating your AI video...\n⏳ This can take a minute or two...")

      const apiUrl = `https://omegatech-api.dixonomega.tech/api/ai/veo3?prompt=${encodeURIComponent(prompt)}`

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 180000)
      const response = await fetch(apiUrl, { signal: controller.signal })
      clearTimeout(timeout)

      if (!response.ok) {
        console.log("[v0] OmegaTech veo3 API failed:", response.status)
        return void reply("❌ Could not generate video. Please try again in a moment.")
      }

      const data = (await response.json()) as any
      const videoUrl: string | null = data?.videoUrl || null

      if (!data?.success || !videoUrl) {
        console.log("[v0] Video response:", JSON.stringify(data).substring(0, 300))
        return void reply("❌ No video was generated. Try a different prompt.")
      }

      const caption = `🎬 *AI Generated Video*\n\nPrompt: ${prompt}\n\nPowered by WhatsBot - World of Technology Team`

      try {
        // Try streaming from the URL first (video files are large).
        await this.sock.sendMessage(remoteJid, { video: { url: videoUrl }, caption })
        return void reply("✓ Video generated and sent!")
      } catch (sendErr) {
        logger.debug({ sendErr }, "video url send failed, retrying with bytes")
        // Fallback: download the bytes ourselves, then send.
        const buf = await this.fetchImage(videoUrl)
        if (!buf) return void reply(`✓ Video generated (open the link):\n${videoUrl}`)
        await this.sock.sendMessage(remoteJid, { video: buf, caption })
        return void reply("✓ Video generated and sent!")
      }
    } catch (err) {
      logger.debug({ err }, "ai video generation failed")
      console.log("[v0] AI video generation error:", err)
      await reply("❌ Failed to generate video. Please try again with a different prompt.")
    }
  }

  private async cmdYouTubeDl(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!args) {
      return void reply("Usage: .ytdl <YouTube URL>\n\nDownloads full YouTube video in best quality.\nSupports any YouTube link format.")
    }

    if (!this.sock) return

    try {
      await reply("⏳ Downloading YouTube video...")

      const url = args.trim()
      const apis = [
        { url: "https://www.puruboy.kozow.com/api/downloader/youtube", name: "youtube" },
        { url: "https://www.puruboy.kozow.com/api/downloader/savetube", name: "savetube" },
      ]

      let success = false
      let videoUrl = null
      let title = "YouTube Video"

      for (const api of apis) {
        try {
          const res = await fetch(api.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          })

          if (!res.ok) continue

          const data = (await res.json()) as any
          
          videoUrl = 
            data.video || 
            data.result?.video ||
            data.result?.url ||
            data.video_url || 
            data.url || 
            data.download_url || 
            data.data?.url

          title = data.title || data.result?.title || "YouTube Video"

          if (videoUrl) {
            console.log("[v0] YouTube downloaded via", api.name)
            success = true
            break
          }
        } catch (e) {
          console.log("[v0] API", api.name, "failed, trying next...")
          continue
        }
      }

      if (!success || !videoUrl) {
        return void reply("❌ Could not download YouTube video. The URL might be invalid, restricted, or deleted. Try another link.")
      }

      try {
        await this.sock.sendMessage(remoteJid, {
          video: { url: videoUrl },
          caption: `✓ ${title}\n\nDownloaded by WhatsBot - World of Technology Team`,
        })
        await reply("✓ Video sent!")
      } catch (sendErr) {
        logger.debug({ sendErr }, "failed to send youtube video")
        await reply(`✓ Video ready:\n${videoUrl}`)
      }
    } catch (err) {
      logger.debug({ err }, "youtube download failed")
      await reply("❌ Failed to download. Please try again with a different link or later.")
    }
  }

  private async cmdXDownload(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!args) {
      return void reply("Usage: .x <X/Twitter URL>\n\nDownloads videos and media from X (Twitter).\nSupports any X.com or twitter.com link.")
    }

    if (!this.sock) return

    try {
      await reply("⏳ Downloading from X...")

      const url = args.trim()
      const apis = [
        { url: "https://www.puruboy.kozow.com/api/downloader/x", name: "x" },
      ]

      let success = false
      let mediaUrl = null

      for (const api of apis) {
        try {
          const res = await fetch(api.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          })

          if (!res.ok) continue

          const data = (await res.json()) as any
          
          mediaUrl = 
            data.media || 
            data.result?.media || 
            data.result?.url ||
            data.video_url || 
            data.url || 
            data.media_url || 
            data.download_url || 
            data.data?.url

          if (mediaUrl) {
            console.log("[v0] X media downloaded via", api.name)
            success = true
            break
          }
        } catch (e) {
          console.log("[v0] API", api.name, "failed")
          continue
        }
      }

      if (!success || !mediaUrl) {
        return void reply("❌ Could not download X media. The URL might be invalid, deleted, or private. Try another link.")
      }

      try {
        await this.sock.sendMessage(remoteJid, {
          video: { url: mediaUrl },
          caption: "✓ X/Twitter media downloaded\n\nPowered by WhatsBot",
        })
        await reply("✓ Media sent!")
      } catch (sendErr) {
        logger.debug({ sendErr }, "failed to send x media")
        await reply(`✓ Media ready:\n${mediaUrl}`)
      }
    } catch (err) {
      logger.debug({ err }, "x download failed")
      await reply("❌ Failed to download from X. Please try again later.")
    }
  }

  private async cmdTikTokDownload(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!args) {
      return void reply("Usage: .tt <TikTok URL>\n\nDownloads TikTok videos without watermark.\nSupports any TikTok link format.")
    }

    if (!this.sock) return

    try {
      await reply("⏳ Downloading TikTok video...")

      const url = args.trim()
      
      // Try multiple TikTok APIs in sequence
      const apis = [
        { url: "https://www.puruboy.kozow.com/api/downloader/tiktok-v2", name: "tiktok-v2" },
        { url: "https://www.puruboy.kozow.com/api/downloader/tiktok", name: "tiktok" },
        { url: "https://www.puruboy.kozow.com/api/downloader/snaptik", name: "snaptik" },
      ]

      let success = false
      let videoUrl = null

      for (const api of apis) {
        try {
          const res = await fetch(api.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          })

          if (!res.ok) continue

          const data = (await res.json()) as any
          
          // Try all possible response formats
          videoUrl = 
            data.video || 
            data.result?.video || 
            data.result?.url ||
            data.video_url || 
            data.url || 
            data.download_url || 
            data.data?.url ||
            data.media ||
            data.result?.media ||
            data.result?.download_url

          if (videoUrl) {
            console.log("[v0] TikTok downloaded via", api.name)
            success = true
            break
          }
        } catch (e) {
          console.log("[v0] API", api.name, "failed, trying next...")
          continue
        }
      }

      if (!success || !videoUrl) {
        return void reply("❌ Could not download TikTok video. The URL might be invalid, private, or deleted. Try another link.")
      }

      // Send video to user
      try {
        await this.sock.sendMessage(remoteJid, {
          video: { url: videoUrl },
          caption: "✓ TikTok video downloaded successfully\n\nPowered by WhatsBot",
        })
        await reply("✓ Video sent!")
      } catch (sendErr) {
        logger.debug({ sendErr }, "failed to send tiktok video")
        await reply(`✓ Video ready:\n${videoUrl}`)
      }
    } catch (err) {
      logger.debug({ err }, "tiktok download failed")
      await reply("❌ Failed to download. Please try with a different link or try again later.")
    }
  }

  private async cmdSpotifyDownload(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!args) {
      return void reply("Usage: .spotify <Spotify URL or track link>\n\nDownloads Spotify tracks as MP3.\nSupports any Spotify link format (open.spotify.com).")
    }

    if (!this.sock) return

    try {
      await reply("⏳ Downloading from Spotify...")

      const url = args.trim()
      const res = await fetch("https://www.puruboy.kozow.com/api/downloader/spotify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })

      if (!res.ok) {
        return void reply("❌ Failed to connect to Spotify service. Try again later.")
      }

      const data = (await res.json()) as any
      const audioUrl = 
        data.audio || 
        data.result?.audio || 
        data.result?.url ||
        data.audio_url || 
        data.url || 
        data.download_url || 
        data.data?.url
      
      const title = data.title || data.result?.title || "Spotify Track"

      if (!audioUrl) {
        console.log("[v0] Spotify response:", JSON.stringify(data))
        return void reply("❌ Could not download Spotify track. The URL might be invalid or the track unavailable. Try another link.")
      }

      try {
        await this.sock.sendMessage(remoteJid, {
          audio: { url: audioUrl },
          mimetype: "audio/mpeg",
          ptt: false,
        })
        await reply("✓ Audio sent!")
      } catch (sendErr) {
        logger.debug({ sendErr }, "failed to send spotify audio")
        await reply(`✓ Audio ready:\n${audioUrl}`)
      }
    } catch (err) {
      logger.debug({ err }, "spotify download failed")
      await reply("❌ Failed to download from Spotify. Please try again later.")
    }
  }

  private async cmdSoundCloudDownload(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!args) {
      return void reply("Usage: .sc <SoundCloud URL>\n\nDownloads SoundCloud tracks as MP3.\nSupports any SoundCloud link format.")
    }

    if (!this.sock) return

    try {
      await reply("⏳ Downloading from SoundCloud...")

      const url = args.trim()
      const apis = [
        { url: "https://www.puruboy.kozow.com/api/downloader/soundcloud-v2", name: "soundcloud-v2" },
        { url: "https://www.puruboy.kozow.com/api/downloader/soundcloud", name: "soundcloud" },
      ]

      let success = false
      let audioUrl = null
      let title = "SoundCloud Track"

      for (const api of apis) {
        try {
          const res = await fetch(api.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          })

          if (!res.ok) continue

          const data = (await res.json()) as any
          
          audioUrl = 
            data.audio || 
            data.result?.audio || 
            data.result?.url ||
            data.audio_url || 
            data.url || 
            data.download_url || 
            data.data?.url

          title = data.title || data.result?.title || "SoundCloud Track"

          if (audioUrl) {
            console.log("[v0] SoundCloud downloaded via", api.name)
            success = true
            break
          }
        } catch (e) {
          console.log("[v0] API", api.name, "failed, trying next...")
          continue
        }
      }

      if (!success || !audioUrl) {
        return void reply("❌ Could not download SoundCloud track. The URL might be invalid, deleted, or restricted. Try another link.")
      }

      try {
        await this.sock.sendMessage(remoteJid, {
          audio: { url: audioUrl },
          mimetype: "audio/mpeg",
          ptt: false,
        })
        await reply("✓ Audio sent!")
      } catch (sendErr) {
        logger.debug({ sendErr }, "failed to send soundcloud audio")
        await reply(`✓ Audio ready:\n${audioUrl}`)
      }
    } catch (err) {
      logger.debug({ err }, "soundcloud download failed")
      await reply("❌ Failed to download from SoundCloud. Please try again later.")
    }
  }

  private async cmdInstagramDownload(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!args) {
      return void reply("Usage: .ig <Instagram post/reel URL>\n\nDownloads Instagram photos, reels, and stories.\nSupports any Instagram link format (instagram.com, ig.me).")
    }

    if (!this.sock) return

    try {
      await reply("⏳ Downloading from Instagram...")

      const url = args.trim()
      const apis = [
        { url: "https://www.puruboy.kozow.com/api/downloader/instagram", name: "instagram" },
      ]

      let success = false
      let mediaUrl = null

      for (const api of apis) {
        try {
          const res = await fetch(api.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          })

          if (!res.ok) continue

          const data = (await res.json()) as any
          
          mediaUrl = 
            data.media || 
            data.result?.media || 
            data.result?.url ||
            data.media_url || 
            data.url || 
            data.download_url || 
            data.data?.url

          if (mediaUrl) {
            console.log("[v0] Instagram downloaded via", api.name)
            success = true
            break
          }
        } catch (e) {
          console.log("[v0] API", api.name, "failed")
          continue
        }
      }

      if (!success || !mediaUrl) {
        return void reply("❌ Could not download Instagram media. The URL might be invalid, deleted, or private. Try another link.")
      }

      try {
        await this.sock.sendMessage(remoteJid, {
          video: { url: mediaUrl },
          caption: "✓ Instagram media downloaded\n\nPowered by WhatsBot",
        })
        await reply("✓ Media sent!")
      } catch (sendErr) {
        logger.debug({ sendErr }, "failed to send instagram media")
        await reply(`✓ Media ready:\n${mediaUrl}`)
      }
    } catch (err) {
      logger.debug({ err }, "instagram download failed")
      await reply("❌ Failed to download from Instagram. Please try again later.")
    }
  }

  private async cmdFacebookDownload(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!args) {
      return void reply("Usage: .fbdl <Facebook video/reel URL>\n\nDownloads Facebook videos, reels, and posts.\nSupports any Facebook link format (facebook.com, fb.me).")
    }

    if (!this.sock) return

    try {
      await reply("⏳ Downloading from Facebook...")

      const url = args.trim()
      const apis = [
        { url: "https://www.puruboy.kozow.com/api/downloader/fbdl", name: "fbdl" },
        { url: "https://www.puruboy.kozow.com/api/downloader/fb", name: "fb" },
      ]

      let success = false
      let videoUrl = null

      for (const api of apis) {
        try {
          const res = await fetch(api.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          })

          if (!res.ok) continue

          const data = (await res.json()) as any
          
          videoUrl = 
            data.video || 
            data.result?.video || 
            data.result?.url ||
            data.video_url || 
            data.url || 
            data.download_url || 
            data.data?.url

          if (videoUrl) {
            console.log("[v0] Facebook downloaded via", api.name)
            success = true
            break
          }
        } catch (e) {
          console.log("[v0] API", api.name, "failed, trying next...")
          continue
        }
      }

      if (!success || !videoUrl) {
        return void reply("❌ Could not download Facebook video. The URL might be invalid, deleted, or restricted. Try another link.")
      }

      try {
        await this.sock.sendMessage(remoteJid, {
          video: { url: videoUrl },
          caption: "✓ Facebook video downloaded\n\nPowered by WhatsBot - World of Technology Team",
        })
        await reply("✓ Video sent!")
      } catch (sendErr) {
        logger.debug({ sendErr }, "failed to send facebook video")
        await reply(`✓ Video ready:\n${videoUrl}`)
      }
    } catch (err) {
      logger.debug({ err }, "facebook download failed")
      await reply("❌ Failed to download from Facebook. Please try again later.")
    }
  }

  private async cmdDownloadSearchResult(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!args) {
      return void reply("Usage: .download <number>\n\nDownload from recent search results (1-5)")
    }

    if (!this.sock) return

    try {
      const num = parseInt(args.trim(), 10)
      if (isNaN(num) || num < 1 || num > 5) {
        return void reply("Please provide a number between 1 and 5")
      }

      // Find the most recent search for this chat
      const searchKeys = Object.keys(this.searchCache).filter((k) =>
        k.startsWith(`search_${remoteJid}_`)
      )
      
      if (searchKeys.length === 0) {
        return void reply("No recent searches. Use .play <song> to search first.")
      }

      const latestKey = searchKeys.sort().pop()
      if (!latestKey) return void reply("No search results found.")

      const results = this.searchCache[latestKey] as any[]
      if (!results || results.length < num) {
        return void reply(`Only ${results?.length || 0} results available.`)
      }

      const selectedResult = results[num - 1]
      const videoUrl = selectedResult.url

      if (!videoUrl) {
        return void reply("Could not get video URL. Please try a different result.")
      }

      await reply(`⏳ Downloading: ${selectedResult.title}`)

      // Download as MP3 from YouTube
      const dlRes = await fetch("https://www.puruboy.kozow.com/api/downloader/ytmp3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: videoUrl }),
      })

      if (!dlRes.ok) {
        return void reply("Failed to download. Please try another result.")
      }

      const dlData = (await dlRes.json()) as any
      const audioUrl = dlData.audio || dlData.result?.audio || dlData.url || dlData.download_url || dlData.data?.url

      if (!audioUrl) {
        console.log("[v0] YT MP3 download response:", JSON.stringify(dlData))
        return void reply("Could not extract audio. Try another result.")
      }

      try {
        await this.sock.sendMessage(remoteJid, {
          audio: { url: audioUrl },
          mimetype: "audio/mpeg",
          ptt: false,
        })
        
        const caption = `✓ *${selectedResult.title}*\nChannel: ${selectedResult.channel}\n\nPowered by WhatsBot`
        await reply(caption)
      } catch (sendErr) {
        logger.debug({ sendErr }, "failed to send downloaded audio")
        await reply(`✓ Audio ready:\n${audioUrl}`)
      }
    } catch (err) {
      logger.debug({ err }, "download search result failed")
      await reply("Failed to download. Please try again.")
    }
  }
}
