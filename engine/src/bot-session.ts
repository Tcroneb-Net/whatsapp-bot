import { createRequire } from "module"
import { randomUUID } from "crypto"
import type { WAMessage, proto } from "@japofc/baileys"
type WASocket = any

// Baileys ships as CommonJS. Under Node's ESM interop, `import makeWASocket from
// "@japofc/baileys"` resolves to `module.exports` (the namespace object,
// not the factory function), which throws "makeWASocket is not a function" at
// runtime. Loading via createRequire gives us the real callable exports across
// Baileys versions.
const require = createRequire(import.meta.url)
const baileys = require("@japofc/baileys")
// NOTE: do not name this `makeWASocket`. The imported `WASocket` type is
// defined as `ReturnType<typeof makeWASocket>`, so a local binding with that
// name shadows it and collapses the socket type to `never`.
const createWASocket: any = baileys.makeWASocketAuto ?? baileys.makeWASocket ?? baileys.default
const DisconnectReason: any = baileys.DisconnectReason
const downloadMediaMessage: any = baileys.downloadMediaMessage
const fetchLatestBaileysVersion: any = baileys.fetchLatestBaileysVersion
const Browsers: any = baileys.Browsers
import bcrypt from "bcryptjs"
import os from "os"
import { readFile } from "fs/promises"
import { config, bannerUrl, bannerFilePath, randomEmoji, pickRandomEmoji, type BannerCategory } from "./config.js"
import { logger, baileysLogger, isCryptoNoise } from "./logger.js"
import { bots } from "./db.js"
import { useMongoAuthState, clearMongoAuthState } from "./mongo-auth-state.js"
import { DEFAULT_SETTINGS, type BotSettings } from "./types.js"
import { hostify, safeHostify } from "./hostify.js"
import { welcomeMessage, menuMessage, pairInfoMessage, lyricsMessage, styleReply, getRandomMenuBanner, getRandomAliveBanner, getRandomPingBanner } from "./messages.js"

const PRESENCE_KEEPALIVE_MS = 30 * 60 * 1000 // 30 minutes instead of 10 to reduce resource usage

// Human-like behavior to prevent WhatsApp bans
class HumanBehavior {
  // Random typing speed: 40-80 WPM = 75-150ms per character
  static getTypingDelay(messageLength: number): number {
    const charDelay = 75 + Math.random() * 75 // 75-150ms per char
    return Math.min(messageLength * charDelay, 5000) // Cap at 5 seconds
  }

  // Random reading time before responding
  static getReadingDelay(): number {
    return 1000 + Math.random() * 4000 // 1-5 seconds
  }

  // Simulate thinking time for commands
  static getThinkingDelay(): number {
    return 500 + Math.random() * 2000 // 0.5-2.5 seconds
  }

  // Random small pauses between actions (like a human scrolling)
  static getActionDelay(): number {
    return 300 + Math.random() * 800 // 0.3-1.1 seconds
  }

  // Desktop client indicators
  static getClientInfo() {
    return {
      browser: Browsers.ubuntu("Chrome"),
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
    }
  }

  // Simulate realistic online/offline patterns
  static async setHumanPresence(socket: WASocket): Promise<void> {
    try {
      // Randomly go idle occasionally (like a person away from computer)
      const isIdle = Math.random() > 0.85 // 15% chance to be idle
      if (isIdle) {
        await socket.sendPresenceUpdate("unavailable")
        await new Promise(r => setTimeout(r, 5000 + Math.random() * 10000)) // 5-15s away
      }
      await socket.sendPresenceUpdate("available")
    } catch (err) {
      // Silently fail - presence is not critical
    }
  }
}

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
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readonly handledMessages = new Set<string>()
  private pendingPairingResolve: ((code: string) => void) | null = null
  // Plaintext password held in memory only, to DM once on first connect.
  private pendingWelcomePassword: string | null = null
  private welcomeSent = false
  private onTerminalDisconnect: (() => void) | null = null
  // Keepalive timer that holds the "always online" presence.
  private presenceTimer: ReturnType<typeof setInterval> | null = null
  // Periodic settings refresh from MongoDB (auto-sync dashboard changes).
  private settingsRefreshTimer: ReturnType<typeof setInterval> | null = null
  // Auto-clear cache timer for performance optimization.
  private cacheCleanTimer: ReturnType<typeof setInterval> | null = null
  // Cache for search results (for .download command)
  private searchCache: Record<string, any> = {}
  // Group Work Tracking: group JID -> { messageCount, lockedUntil, lockTimer }
  private groupWorkTracking: Map<string, {
    messageCount: number
    isLocked: boolean
    lockedAt: number | null
    lockTimer: ReturnType<typeof setTimeout> | null
  }> = new Map()
  // Anti-Spam Tracking: user JID -> { warnCount, lastMessageTime, messageTimestamps }
  private antiSpamTracking: Map<string, {
    warnCount: number
    lastMessageTime: number
    messageTimestamps: number[]
  }> = new Map()

  constructor(number: string) {
    this.number = number
  }

  setTerminalDisconnectHandler(handler: () => void): void {
    this.onTerminalDisconnect = handler
  }

  setPendingWelcomePassword(password: string): void {
    this.pendingWelcomePassword = password
    this.welcomeSent = false
  }

  async loadSettings(): Promise<void> {
    try {
      const doc = await bots().findOne({ number: this.number })
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...doc?.settings,
        plugins: doc?.plugins ?? [],
        antiLink: {
          enabled: doc?.settings?.antiLink?.enabled ?? DEFAULT_SETTINGS.antiLink!.enabled,
          groupJid: doc?.settings?.antiLink?.groupJid ?? DEFAULT_SETTINGS.antiLink!.groupJid,
          warnings: doc?.settings?.antiLink?.warnings ?? DEFAULT_SETTINGS.antiLink!.warnings,
        },
      }
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
    logger.info({ number: this.number }, "refreshing session settings")
    const oldSettings = { ...this.settings }
    await this.loadSettings()
    
    // Log what changed
    const changes: Record<string, { old: unknown; new: unknown }> = {}
    for (const key in this.settings) {
      const k = key as keyof typeof this.settings
      const oldVal = oldSettings[k]
      const newVal = this.settings[k]
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes[key] = { old: oldVal, new: newVal }
      }
    }
    
    if (Object.keys(changes).length > 0) {
      logger.info({ changes }, "settings updated from dashboard")
    }
    
    // Re-apply presence in case "always online" was toggled from the dashboard.
    this.applyPresence()

    // Keep the WhatsApp profile name in sync with dashboard identity changes.
    if (this.sock && this.settings.botName !== oldSettings.botName && this.settings.botName.trim()) {
      try {
        await this.sock.updateProfileName(this.settings.botName.trim())
        logger.info({ number: this.number, botName: this.settings.botName }, "WhatsApp profile name updated")
      } catch (err) {
        logger.warn({ number: this.number, err }, "failed to update WhatsApp profile name")
      }
    }
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
    // Refresh every 60 seconds while connected (reduced from 30s to save resources)
    this.settingsRefreshTimer = setInterval(async () => {
      try {
        await this.refreshSettings()
      } catch (err) {
        logger.debug({ err }, "periodic settings refresh failed")
      }
    }, 60000)

    // Start auto-clear cache timer if configured
    this.startCacheClearTimer()
  }

  private clearSettingsRefreshTimer(): void {
    if (this.settingsRefreshTimer) {
      clearInterval(this.settingsRefreshTimer)
      this.settingsRefreshTimer = null
    }
  }

  private startCacheClearTimer(): void {
    const cacheHours = ((this.settings as any).autoClearCacheHours) || 0
    if (!cacheHours || cacheHours <= 0) return
    
    const intervalMs = cacheHours * 3600 * 1000
    this.cacheCleanTimer = setInterval(() => {
      this.clearCache()
    }, intervalMs)
    
    // Run once on startup (fire and forget)
    void this.clearCache()
  }

  private clearCacheClearTimer(): void {
    if (this.cacheCleanTimer) {
      clearInterval(this.cacheCleanTimer)
      this.cacheCleanTimer = null
    }
  }

  private async clearCache(): Promise<void> {
    try {
      // Clear search cache
      this.searchCache = Object.create(null)
      
      // Update last cache clear timestamp in settings
      (this.settings as any).lastCacheClear = new Date()
      await this.saveSettings()
      
      console.log("[v0] Cache cleared for bot:", this.number)
      logger.info({ number: this.number }, "cache auto-cleared")
    } catch (err) {
      logger.debug({ err }, "failed to clear cache")
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

  getSettings(): BotSettings {
    return { ...this.settings }
  }

  isConnected(): boolean {
    return Boolean(this.sock?.user)
  }

  async getConnectedPeopleCount(): Promise<number> {
    if (!this.sock || !this.isConnected()) return 0
    const chats = await this.sock.groupFetchAllParticipating()
    const counts = await Promise.all(Object.keys(chats).map(async (jid) => {
      try { return (await this.sock!.groupMetadata(jid)).participants.length } catch { return 0 }
    }))
    return counts.reduce((total, count) => total + count, 0)
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

    this.sock = await createWASocket({
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

    this.sock.ev.on("creds.update", () => {
      void this.saveCreds?.().catch((err) =>
        logger.error({ number: this.number, err }, "credential persistence failed"),
      )
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
        // Apply the always-online preference; otherwise remain unavailable.
        this.applyPresence()
        if (!this.settings.alwaysOnline) this.sock?.sendPresenceUpdate("unavailable").catch(() => {})
        // Start periodic settings refresh so dashboard changes sync automatically.
        this.startSettingsRefresh()
        // Promote owner as admin in all groups where bot is admin
        void this.promoteOwnerAsAdmin()
      }

      if (connection === "close") {
        this.clearSettingsRefreshTimer()
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
        const terminalCodes = new Set([
          DisconnectReason.loggedOut,
          DisconnectReason.badSession,
          DisconnectReason.connectionReplaced,
          DisconnectReason.multideviceMismatch,
          DisconnectReason.forbidden,
        ])
        const terminal = terminalCodes.has(statusCode)

        await this.setStatus("disconnected")
        this.clearPresenceTimer()
        logger.warn({ number: this.number, statusCode, terminal }, "connection closed")
        this.sock = null

        if (terminal) {
          // These codes mean the stored Signal/WhatsApp identity cannot recover.
          // Remove only this number so other bots remain online and require pairing.
          await clearMongoAuthState(this.number)
          await bots().deleteOne({ number: this.number })
          logger.warn({ number: this.number, statusCode }, "removed unusable bot session")
          this.onTerminalDisconnect?.()
          return
        }

        if (!this.stopped && !this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null
            void this.start().catch((err) =>
              logger.error({ number: this.number, err }, "reconnect failed"),
            )
          }, RECONNECT_DELAY_MS)
        }
      }
    })

  this.sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return
    for (const msg of messages) {
      void this.handleMessage(msg).catch((err) => {
        const message = err instanceof Error ? err.message : String(err)
        const log = isCryptoNoise(err) ? logger.debug.bind(logger) : logger.warn.bind(logger)
        log({ number: this.number, message, id: msg.key.id }, "message ignored after handler failure")
      })
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

  // Fetch remote or local images with a bounded timeout and payload size.
  private async fetchImage(url: string): Promise<Buffer | null> {
    try {
      const target = /^https?:\/\//i.test(url) ? url : `file://${url}`
      if (target.startsWith("file://")) return await readFile(url)
      const res = await fetch(target, {
        headers: { "User-Agent": "SpiderMini/1.0" },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return null
      const size = Number(res.headers.get("content-length") || 0)
      if (size > 10 * 1024 * 1024) return null
      const data = await res.arrayBuffer()
      if (data.byteLength > 10 * 1024 * 1024) return null
      return Buffer.from(data)
    } catch (err) {
      logger.debug({ err, url }, "image fetch failed")
      return null
    }
  }

  private async loadBanner(category: BannerCategory): Promise<Buffer | null> {
    const localPath = bannerFilePath(category)
    if (localPath) {
      try {
        logger.debug({ category, localPath }, "loading local engine asset")
        return await readFile(localPath)
      } catch (err) {
        logger.warn({ category, localPath, err }, "local engine asset could not be read")
      }
    } else {
      logger.debug({ category }, "local engine asset not found; using remote fallback")
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
    const messageId = msg.key.id
    if (messageId) {
      if (this.handledMessages.has(messageId)) return
      this.handledMessages.add(messageId)
      if (this.handledMessages.size > 2000) {
        const oldest = this.handledMessages.values().next().value
        if (oldest) this.handledMessages.delete(oldest)
      }
    }

    // --- Smart Online Status: Show online only when active (not always online) ---
    if (!this.settings.alwaysOnline) {
      try {
        void this.sock.sendPresenceUpdate("available").catch((err) => {
          logger.debug({ err }, "failed to set online on activity")
        })
      } catch (err) {
        logger.debug({ err }, "failed to set online on activity")
      }
    }

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

    // Commands take priority. Auxiliary moderation/analytics work runs after
    // dispatch so a slow database or media operation never delays replies.
    await this.handleCommands(msg, remoteJid)

    void (async () => {
      if (this.settings.antiViewOnce) {
        try { await this.handleViewOnce(msg) } catch (err) { logger.debug({ err }, "view-once handler error") }
      }
      if (
        remoteJid.endsWith("@g.us") &&
        this.settings.antiLink?.enabled === true &&
        (!this.settings.antiLink.groupJid || this.settings.antiLink.groupJid === remoteJid)
      ) {
        try { await this.handleAntiLink(msg, remoteJid) } catch (err) { logger.debug({ err }, "antilink handler error") }
      }
      if (remoteJid.endsWith("@g.us") && this.settings.groupWorkEnabled) {
        try { await this.handleGroupWorkCounting(msg, remoteJid) } catch (err) { logger.debug({ err }, "group work counting error") }
      }
    })()

    // --- AutoChat: Auto-reply to direct messages with AI ---
    // Baileys can represent direct chats as @s.whatsapp.net or @lid.
    const isDirectChat = remoteJid.endsWith("@s.whatsapp.net") || remoteJid.endsWith("@lid")
    const scope = this.settings.chatScope || "dm"
    const scopeAllowsChat = scope === "all" || (scope === "dm" && isDirectChat) || (scope === "groups" && remoteJid.endsWith("@g.us")) || (scope === "inbox" && isDirectChat)
    if (this.settings.autoChatEnabled === true && scopeAllowsChat) {
      logger.info({ number: this.number, remoteJid, scope, aiEnabled: this.settings.aiEnabled }, "autochat accepted")
      // Never hold the message event loop open while an AI provider responds.
      // Commands and later messages remain responsive during slow API calls.
      void this.handleAutoChat(msg, remoteJid).catch((err) => {
        logger.debug({ err }, "autochat handler error")
      })
    }
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
    // Auto-view status with delay
    if (this.settings.autoStatusView) {
      const delay = (((this.settings as any).autoStatusViewDelay) || 0) * 1000
      setTimeout(() => {
        if (!this.settings.autoStatusView) return
        try {
          this.sock?.readMessages([msg.key])
        } catch (err) {
          logger.debug({ err }, "status read failed")
        }
      }, delay)
    }

    // Auto-react to status with delay
    if (this.settings.autoStatusReact) {
      const delay = ((this.settings as any).autoStatusReactDelay || 0) * 1000
      setTimeout(async () => {
        if (!this.settings.autoStatusReact) return
        try {
          const emoji = pickRandomEmoji(this.settings.statusReactEmojis)
          const participant = msg.key.participant
          
          if (participant && this.sock) {
            try {
              await this.sock.sendMessage(
                "status@broadcast",
                { react: { text: emoji, key: msg.key } },
                { statusJidList: [participant] },
              )
              console.log("[v0] Status react sent:", emoji)
            } catch (reactErr) {
              console.log("[v0] Status react error:", reactErr)
            }
          }
        } catch (err) {
          logger.debug({ err }, "status react failed")
        }
      }, delay)
    }

    // Auto-like status with delay
    if ((this.settings as any).autoLikeStatus) {
      const delay = (((this.settings as any).autoLikeDelay) || 2) * 1000
      setTimeout(async () => {
        if (!(this.settings as any).autoLikeStatus) return
        try {
          const participant = msg.key.participant
          
          if (participant && this.sock) {
            try {
              await this.sock.sendMessage(
                "status@broadcast",
                { react: { text: "❤️", key: msg.key } },
                { statusJidList: [participant] },
              )
              console.log("[v0] Status auto-like sent")
            } catch (likeErr) {
              console.log("[v0] Status like error:", likeErr)
            }
          }
        } catch (err) {
          logger.debug({ err }, "status auto-like failed")
        }
      }, delay)
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

  private async handleAutoChat(msg: WAMessage, remoteJid: string): Promise<void> {
    if (!this.sock) return
    // Skip if this is a command message (starts with prefix)
    const text = this.extractText(msg).trim()
    if (text.startsWith(this.settings.prefix)) return
    // Skip if it's a message from the owner (they don't need autochat responses)
    if (msg.key.fromMe) return
    // Skip empty messages
    if (!text) return

    try {
      void this.sendTyping(remoteJid)

      let response: string
      
      if ((this.settings as any).autoChatUseAI && this.settings.aiEnabled) {
        // Use AI to generate response
        response = await this.generateAIResponse(text)
      } else {
        // Use default smart response
        response = this.getSmartResponse(text)
      }

      logger.info({ number: this.number, remoteJid, responseLength: response.length }, "autochat sending reply")
      await this.sock.sendMessage(remoteJid, { text: response || this.getSmartResponse(text) }, { quoted: msg })
    } catch (err) {
      logger.debug({ err }, "autochat response failed")
    }
  }

  private async generateAIResponse(userMessage: string): Promise<string> {
    try {
      // Use the Hostify API or built-in AI if configured
      const personaPrompt = this.settings.aiPersona 
        ? `You are ${this.settings.aiPersona}. `
        : `You are a helpful WhatsApp bot running on WhatsBot by Hostify (whatsbot.hostify.co.zw). `

      const systemPrompt = personaPrompt +
        `Keep responses brief and conversational (1-3 sentences). ` +
        `If asked about yourself, mention you're powered by Hostify. ` +
        `Be friendly and helpful.`

      // Try to use an AI service via the Hostify API
      try {
        const params = new URLSearchParams({
          action: "chat",
          message: userMessage,
          context: systemPrompt,
        })
        const aiResponse = await fetch(`https://api.omegatech.app/api/ai/notice?${params.toString()}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(2500),
        })

        if (aiResponse.ok) {
          const raw = await aiResponse.text()
          let data: any = raw
          try { data = JSON.parse(raw) } catch { /* plain-text API response */ }
          const result = typeof data === "string"
            ? data
            : data?.result ?? data?.response ?? data?.message ?? data?.text ?? data?.data?.response ?? data?.data?.message
          if (result) {
            return String(result).slice(0, 500) // Limit response length
          }
        }
      } catch (aiErr) {
        logger.debug({ aiErr }, "ai service error")
      }

      // Fallback to smart response if AI fails
      return this.getSmartResponse(userMessage)
    } catch (err) {
      logger.debug({ err }, "ai response generation failed")
      return this.getSmartResponse(userMessage)
    }
  }

  private getSmartResponse(userMessage: string): string {
    const msg = userMessage.toLowerCase()
    const botName = this.settings.botName

    // Greeting detection
    if (
      msg.includes("hi") ||
      msg.includes("hello") ||
      msg.includes("hey") ||
      msg.includes("assalam")
    ) {
      return `👋 Hey! I'm ${botName}. How can I help you today?`
    }

    // Help/info requests
    if (msg.includes("help") || msg.includes("info") || msg.includes("what")) {
      return `ℹ️ I'm ${botName}, a WhatsApp bot by Hostify. Type ${this.settings.prefix}menu for available commands. Visit whatsbot.hostify.co.zw for more info.`
    }

    // Bot info
    if (msg.includes("who") || msg.includes("you") || msg.includes("bot")) {
      return `🤖 I'm ${botName}, powered by WhatsBot (whatsbot.hostify.co.zw). I can download videos, answer questions, and more!`
    }

    // Hostify/pricing
    if (msg.includes("hostify") || msg.includes("price") || msg.includes("cost")) {
      return `💡 WhatsBot is powered by Hostify. Check whatsbot.hostify.co.zw for pricing and features!`
    }

    // Default responses
    const responses = [
      `Thanks for the message! Type ${this.settings.prefix}menu to see what I can do.`,
      `I got your message! Need help? Try ${this.settings.prefix}help or visit whatsbot.hostify.co.zw`,
      `👍 Thanks! Feel free to use any command from ${this.settings.prefix}menu`,
      `I'm here to help! Send ${this.settings.prefix}menu for available commands.`,
    ]

    return responses[Math.floor(Math.random() * responses.length)]
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
      
      // Recovered view-once media - logging removed for database optimization
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

    // Regex patterns for blocked links (social media + download services)
    const linkPatterns = [
      // Social media
      /https?:\/\/(www\.)?chat\.whatsapp\.com/i,
      /https?:\/\/(www\.)?(youtube\.com|youtu\.be)/i,
      /https?:\/\/(www\.)?instagram\.com/i,
      /https?:\/\/(www\.)?facebook\.com/i,
      /https?:\/\/(www\.)?tiktok\.com/i,
      /https?:\/\/(vt\.tiktok\.com)/i,
      /https?:\/\/(www\.)?ig\.me/i,
      /https?:\/\/(www\.)?fb\.me/i,
      // Download/file sharing services
      /https?:\/\/(www\.)?download\./i,
      /https?:\/\/(www\.)?mega\.nz/i,
      /https?:\/\/(www\.)?mediafire\.com/i,
      /https?:\/\/(www\.)?zippyshare\.com/i,
      /https?:\/\/(www\.)?sendspace\.com/i,
      /https?:\/\/(www\.)?dropbox\.com/i,
      /https?:\/\/(www\.)?drive\.google\.com/i,
      /https?:\/\/(www\.)?1fichier\.com/i,
    ]

    const hasLink = linkPatterns.some((pattern) => pattern.test(text))
    if (!hasLink) return

    try {
      // Check if sender is the bot owner (fromMe === true)
      const isOwner = msg.key.fromMe === true
      if (isOwner) {
        return // Bot owner is completely exempt from antilink
      }

      let sender = msg.key.participant || msg.key.remoteJid
      if (!sender) return

      const groupMetadata = await this.sock.groupMetadata(remoteJid)
      
      // Normalize sender JID
      if (sender?.includes(":")) {
        sender = sender.split(":")[0] + "@s.whatsapp.net"
      }
      
      const participant = groupMetadata.participants.find((p) => {
        let pId = p.id
        if (pId?.includes(":")) {
          pId = pId.split(":")[0] + "@s.whatsapp.net"
        }
        return pId === sender
      })
      
      // Skip if sender is group admin or super admin (admins bypass antilink)
      if (participant?.isAdmin || participant?.isSuperAdmin) return

      // Initialize warnings tracking if needed
      if (!this.settings.antiLink) {
        this.settings.antiLink = { enabled: true, groupJid: remoteJid, warnings: {} }
      }
      if (!this.settings.antiLink.warnings) {
        this.settings.antiLink.warnings = {}
      }

      // Track warning count for this user
      const warningCount = (this.settings.antiLink.warnings[sender] || 0) + 1
      this.settings.antiLink.warnings[sender] = warningCount
      await this.saveSettings()

      // Delete the message
      try {
        await this.sock.sendMessage(remoteJid, { delete: msg.key })
      } catch (err) {
        logger.debug({ err }, "failed to delete link message")
      }

      // Action based on warning count
      if (warningCount >= 5) {
        // Kick after 5 warnings
        try {
          await this.sock.groupParticipantsUpdate(remoteJid, [sender], "remove")
          await this.sock.sendMessage(remoteJid, {
            text: `🔴 *Link Violation Alert*\n\nUser has been removed for repeatedly posting blocked links.\n\nViolations: ${warningCount}\n\nBanned domains: WhatsApp, YouTube, Instagram, Facebook, TikTok`,
          })
          delete this.settings.antiLink.warnings[sender]
          await this.saveSettings()
          logger.info({ jid: remoteJid, sender, warnings: warningCount }, "user kicked for posting links")
        } catch (kickErr) {
          logger.debug({ kickErr }, "failed to kick user")
        }
      } else if (warningCount >= 3) {
        // Final warning at 3 violations
        try {
          await this.sock.sendMessage(remoteJid, {
            text: `⚠️ *Final Warning*\n\nLink detected and deleted.\n\nWarnings: ${warningCount}/5\n\n${5 - warningCount} more violations = removal from group`,
          })
        } catch (warnErr) {
          logger.debug({ warnErr }, "failed to send final warning")
        }
      } else if (warningCount === 1) {
        // First warning
        try {
          await this.sock.sendMessage(remoteJid, {
            text: `⚠️ *Link Detected*\n\nMessage deleted. No sharing of:\n• WhatsApp links\n• YouTube/Instagram\n• Facebook/TikTok\n\nWarnings: ${warningCount}/5`,
          })
        } catch (warnErr) {
          logger.debug({ warnErr }, "failed to send warning")
        }
      } else {
        // Just delete, show warning count
        try {
          await this.sock.sendMessage(remoteJid, {
            text: `⚠️ *Link Removed*\n\nWarnings: ${warningCount}/5\n\nContinue and risk removal.`,
          })
        } catch (warnErr) {
          logger.debug({ warnErr }, "failed to send warning")
        }
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
    logger.info({ number: this.number, command, hasArgs: Boolean(args) }, "command received")
    const senderJid = msg.key.participant || msg.key.remoteJid || ""
    const normalizeIdentity = (jid: string) => jid.replace(/:\d+(?=@)/, "").replace(/\D/g, "")
    const normalizedSender = normalizeIdentity(senderJid)
    const normalizedOwner = normalizeIdentity(this.ownJid() || this.number)
    const isOwner = msg.key.fromMe === true || (normalizedOwner.length > 0 && normalizedSender.endsWith(normalizedOwner))
  const reply = async (body: string) => {
    // Keep replies immediate. Presence is optional and must never block delivery.
    if ((this.settings as BotSettings & { showTyping?: boolean }).showTyping !== false) void this.sendTyping(remoteJid)
    return this.sock!.sendMessage(remoteJid, { text: styleReply(body) }, { quoted: msg })
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
        case "pair":
          if (this.settings.pairCommandEnabled) {
            await reply(pairInfoMessage())
          } else if (isOwner) {
            await reply(`Pairing is disabled. Enable “Allow .pair requests” in the dashboard first.`)
          }
          break
        case "menu":
        case "help": {
          // Send text immediately; images are optional and must never block the menu.
          const proMenuImg = null
          if (proMenuImg && this.sock) {
            try {
              await this.sock.sendMessage(remoteJid, {
                image: proMenuImg,
                caption: `🕷️ *${this.settings.botName} PRO MENU*\n\nPowered by Spider Mini Maximus\n\nType ${this.settings.prefix}alive for status or ${this.settings.prefix}ping for latency.`,
              })
            } catch (imgErr) {
              logger.debug({ imgErr }, "failed to send pro menu banner")
            }
          }
          
          // Only add the rotating fallback banner when no custom image is configured.
          const randomBannerImg = null
          if (randomBannerImg && this.sock) {
            try {
              await this.sock.sendMessage(remoteJid, {
                image: randomBannerImg,
                caption: "Featured: Today's Bot Animation",
              })
            } catch (imgErr) {
              logger.debug({ imgErr }, "failed to send random menu banner")
            }
          }

          // Send menu text
          await this.sendBranded(
            remoteJid,
            menuMessage(this.settings.botName, prefix, {
              uptime: this.formatUptime(Date.now() - this.startTime),
              ram: this.formatRam(),
              mode: this.settings.publicMode ? "PUBLIC" : "PRIVATE",
              plugins: ((this.settings as any).plugins || [])
                .filter((p: any) => p.enabled)
                .map((p: any) => ({ command: p.command, name: p.name, category: p.category })),
              controls: {
                statusView: this.settings.autoStatusView,
                statusReact: this.settings.autoStatusReact,
                chatbot: this.settings.autoChatEnabled,
                chatScope: this.settings.chatScope,
                viewOnceMode: this.settings.viewOnceMode,
              },
            }),
            "menu",
          )
          break
        }
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
        case "statusview":
        case "autoview":
          await this.cmdToggle(isOwner, "autoStatusView", args, "Auto status view", reply)
          break
        case "statusreact":
        case "autoreact":
          await this.cmdToggle(isOwner, "autoStatusReact", args, "Auto status react", reply)
          break
        case "chatbot":
        case "autochat":
          await this.cmdToggle(isOwner, "autoChatEnabled", args, "DM chatbot", reply)
          break
        case "viewonce":
        case "vvmode":
          await this.cmdViewOnceMode(isOwner, args, reply)
          break
        case "scope":
        case "chatscope":
          await this.cmdChatScope(isOwner, args, reply)
          break
        case "train":
        case "persona":
          await this.cmdTrain(isOwner, args, reply)
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
        case "vv2":
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
  case "remusic":
  case "rm":
  await this.cmdRemusic(args, remoteJid, reply)
  break
        case "translate":
        case "tr":
          await this.cmdTranslate(args, reply)
          break
        case "lyrics":
          await this.cmdLyrics(args, remoteJid, reply)
          break
        case "drama":
        case "dramabox":
        case "dramas":
        case "dramadl":
          await this.cmdDrama(args, remoteJid, reply)
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
        case "song":
        case "search":
        case "ytmp3":
          await this.cmdPlay(args, remoteJid, reply)
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
        case "dub":
          await this.cmdDub(args, remoteJid, reply)
          break
        case "lyrics":
        case "lyric":
          await this.cmdLyrics(args, remoteJid, reply)
          break
        case "autoreact":
        case "ar":
          await this.cmdAutoReact(args, isOwner, reply)
          break
        case "quote":
        case "quotes":
          await this.cmdQuote(args, remoteJid, reply)
          break
        case "vcf":
        case "vcard":
          await this.cmdVcf(remoteJid, reply)
          break
        case "upload":
        case "fileupload":
        case "top4top":
          await this.cmdFileUpload(args, remoteJid, reply, msg)
          break
      case "gstatus":
      case "groupstatus":
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
        case "autostatus":
          await this.cmdAutoStatus(args.split(/\s+/), reply)
          break
        case "autolike":
          await this.cmdAutoLike(args.split(/\s+/), reply)
          break
        case "autochat":
          await this.cmdAutoChat(args.split(/\s+/), reply)
          break
        case "gwork":
          if (this.settings.groupWorkEnabled) await this.cmdGroupWork(remoteJid, msg, reply)
          break
        case "gcount":
          if (this.settings.groupWorkEnabled) await this.cmdGroupCount(remoteJid, reply)
          break
        case "gunlock":
          if (this.settings.groupWorkEnabled) await this.cmdGroupUnlock(remoteJid, reply)
          break
        case "unlock":
          if (this.settings.antiSpamEnabled) await this.cmdUnlock(remoteJid, reply)
          break
        case "locks":
          if (this.settings.antiSpamEnabled) await this.cmdLocks(remoteJid, reply)
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
      }
    } catch (err) {
      logger.error({ number: this.number, command, err }, "command failed")
      await reply("Something went wrong while running that command. Please try again.").catch(() => {})
    }
  }

  private async cmdAlive(remoteJid: string, _msg: WAMessage): Promise<void> {
    // Send random banner image
    const bannerUrl = getRandomAliveBanner()
    const bannerImg = await this.fetchImage(bannerUrl)
    if (bannerImg && this.sock) {
      try {
        await this.sock.sendMessage(remoteJid, {
          image: bannerImg,
          caption: "✅ *BOT IS ALIVE AND RUNNING*",
        })
      } catch (imgErr) {
        logger.debug({ imgErr }, "failed to send alive banner")
      }
    }

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
    
    // Send ping banner image
    const bannerUrl = getRandomPingBanner()
    const bannerImg = await this.fetchImage(bannerUrl)
    if (bannerImg && this.sock) {
      try {
        await this.sock.sendMessage(remoteJid, {
          image: bannerImg,
          caption: `🏓 *PING RESPONSE*\nSpeed: *${latency}ms*`,
        })
      } catch (imgErr) {
        logger.debug({ imgErr }, "failed to send ping banner")
      }
    }
    
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

  private async cmdRemusic(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    const prompt = args.trim().slice(0, 500)
    if (!prompt) return void reply(`*Remusic Studio*\n\nUsage: .remusic <prompt>\nExample: .rm fast hip-hop with female vocals about resilience\n\nReturns the title, cover art, lyrics, and audio.`)
    if (!this.sock) return
    await reply("Remusic is composing your song. Please wait…")
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 180000)
    try {
      const params = new URLSearchParams({ action: "generate", prompt, vocal: "Female Vocal" })
      const res = await fetch(`https://api.omegatech.app/api/ai/Remusicv2?${params}`, { signal: controller.signal })
      const data = await res.json().catch(() => null) as any
      if (!res.ok || !data?.success || !Array.isArray(data?.data?.songs)) {
        return void reply("Remusic could not generate a song right now. Try a shorter, more specific prompt.")
      }
      const song = data.data.songs.find((item: any) => item?.status === "success" && item.audio) || data.data.songs[0]
      if (!song?.audio) return void reply("Remusic returned no playable audio. Please try again.")
      const title = String(song.title || "Untitled track").slice(0, 120)
      const lyrics = String(song.lyrics || "Lyrics were not returned.").slice(0, 6000)
      await this.sock.sendMessage(remoteJid, { text: `*${title}*\n\nPrompt: ${prompt}\nStyle: ${data.data.styles || "Female Vocal"}\n\n*Lyrics*\n${lyrics}` })
      if (song.image) await this.sock.sendMessage(remoteJid, { image: { url: song.image }, caption: `Cover art — ${title}` })
      await this.sock.sendMessage(remoteJid, { audio: { url: song.audio }, mimetype: "audio/mpeg", ptt: false })
      await reply(`Remusic complete: *${title}*\nYour lyrics, cover, and audio are above.`)
    } catch (err) {
      logger.debug({ err }, "remusic command failed")
      await reply("Remusic timed out or is temporarily unavailable. Please try again.")
    } finally {
      clearTimeout(timeout)
    }
  }

  private async cmdSuno(args: string, remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    try {
      const prompt = args.trim()

      // No args - show help
      if (!prompt) {
        return void reply(
          `🎵 *AI Music Creator (Suno 3)*\n\n` +
            `*Usage:* .suno <your music prompt>\n\n` +
            `*Examples:*\n` +
            `• .suno upbeat 80s synthwave with neon vibes\n` +
            `• .suno sad piano ballad about lost love\n` +
            `• .suno hiphop rap track with fire beat\n\n` +
            `*How it works:*\n` +
            `1. Send your music description\n` +
            `2. Reply with title (or press enter for auto)\n` +
            `3. Reply with tags (or press enter for auto)\n` +
            `4. Receive your generated tracks!\n\n` +
            `*Tips:*\n` +
            `- Be descriptive about genre, mood, and style\n` +
            `- Include tempo and instruments if desired`,
        )
      }

      if (!this.sock) return

      // Ask for title
      const titleMsg = await this.sock.sendMessage(remoteJid, {
        text: `🎵 Music generation started!\n\nWhat should be the *title* of your song? (or reply "skip" for auto-generated title)`,
      })

      // Ask for tags
      const tagsMsg = await this.sock.sendMessage(remoteJid, {
        text: `🏷️ What *tags/genres* describe this song? (e.g., "Electronic, Synthwave" or reply "skip" for auto)`,
      })

      await reply("🎵 Generating your Suno 3 track... Please wait...")

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 180000) // 3 min timeout for generation

      // Use the configured Omegatech Suno 3-compatible API endpoint.
      // Keep the provider boundary in one place so it can be replaced safely.
      const sunoUrl = `https://api.omegatech.app/api/ai/suno3`
      const params = new URLSearchParams({
        action: "generate",
        prompt: prompt,
        title: "AI Generated Track",
        tags: "AI Music, Generated",
      })

      const res = await fetch(`${sunoUrl}?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!res.ok) {
        logger.debug({ status: res.status }, "Suno v4 Pro API failed")
        return void reply("❌ Failed to generate music. Please try again with a different prompt.")
      }

      const data = (await res.json()) as any

      if (!data?.success || !data?.data?.tracks || data.data.tracks.length === 0) {
        console.log("[v0] Suno v4 response:", JSON.stringify(data).substring(0, 300))
        return void reply("❌ No music was generated. Please try again.")
      }

      // Send all generated tracks (stream URLs, don't buffer)
      for (let i = 0; i < data.data.tracks.length; i++) {
        const track = data.data.tracks[i]
        const trackNum = i + 1
        const totalTracks = data.data.tracks.length

        try {
          // Send audio with caption
          const caption = `🎵 *${track.title}*\n\nTrack ${trackNum}/${totalTracks}\n📝 Prompt: ${data.data.prompt}\n🏷️ Tags: ${data.data.tags}\n\n@Omegatech-01`

          if (track.videoUrl) {
            // Send video URL (streaming, not buffered)
            await this.sock!.sendMessage(remoteJid, {
              video: { url: track.videoUrl },
              caption: caption,
              mimetype: "video/mp4",
            })
          } else {
            // Send audio as URL (streaming, not buffered)
            await this.sock!.sendMessage(remoteJid, { text: caption })
            await this.sock!.sendMessage(remoteJid, {
              audio: { url: track.audioUrl },
              mimetype: "audio/mpeg",
              ptt: false,
            })

            // Send image URL (streaming)
            if (track.imageUrl) {
              await this.sock!.sendMessage(remoteJid, {
                image: { url: track.imageUrl },
                caption: `Album art for "${track.title}"`,
              })
            }
          }

          // Delay between tracks to avoid rate limiting and give GC time
          await new Promise(r => setTimeout(r, 1500))
          
          // Force garbage collection hint after every 2 tracks
          if (i % 2 === 0 && global.gc) {
            global.gc()
          }
        } catch (err) {
          logger.debug({ err }, `Failed to send track ${trackNum}`)
        }
      }

      // Send completion message
      await reply(
        `✅ *Music generation complete!*\n\n` +
          `Generated ${data.data.tracks.length} track(s)\n` +
          `Model: ${data.data.tracks[0].modelVersion}\n` +
          `Powered by @Omegatech-01`
      )
    } catch (err) {
      logger.debug({ err }, "suno command failed")
      await reply("Failed to create music. Please try again later.")
    }
  }

  private async cmdStatus(remoteJid: string, msg: WAMessage): Promise<void> {
    const s = this.settings
    const status =
      `📊 *${this.settings.botName.toUpperCase()} STATUS*\n\n` +
      `*Core Features:*\n` +
      `${s.aliveEnabled ? "✅" : "❌"} Alive: ${s.aliveEnabled ? "ON" : "OFF"}\n` +
      `${s.pingEnabled ? "✅" : "❌"} Ping: ${s.pingEnabled ? "ON" : "OFF"}\n` +
      `${s.aiEnabled ? "✅" : "❌"} AI: ${s.aiEnabled ? "ON" : "OFF"}\n` +
      `${s.autoStatusView ? "✅" : "❌"} Status view: ${s.autoStatusView ? "ON" : "OFF"}\n` +
      `${s.autoStatusReact ? "✅" : "��"} Status react: ${s.autoStatusReact ? "ON" : "OFF"}\n` +
      `${s.antiViewOnce ? "✅" : "❌"} View-once save: ${s.antiViewOnce ? "ON" : "OFF"}\n` +
      `${s.autoLikeStatus ? "✅" : "❌"} Auto-like status: ${s.autoLikeStatus ? "ON" : "OFF"}\n\n` +
      `*Group Control:*\n` +
      `${s.groupWorkEnabled ? "✅" : "❌"} Group work mode: ${s.groupWorkEnabled ? "ON" : "OFF"}\n` +
      (s.groupWorkEnabled ? `  Threshold: ${s.groupWorkThreshold} messages\n` : "") +
      (s.groupWorkEnabled ? `  Auto-unlock: ${s.groupAutoUnlockMinutes > 0 ? s.groupAutoUnlockMinutes + " min" : "Manual"}\n\n` : "\n") +
      `*Anti-Spam:*\n` +
      `${s.antiSpamEnabled ? "✅" : "❌"} Anti-spam: ${s.antiSpamEnabled ? "ON" : "OFF"}\n` +
      (s.antiSpamEnabled ? `  Rate: ${s.antiSpamMessagesPerMinute} msgs/min\n` : "") +
      (s.antiSpamEnabled ? `  Action: ${s.antiSpamAction}\n\n` : "\n") +
      `*Settings:*\n` +
      `🔒 Mode: ${s.publicMode ? "PUBLIC" : "PRIVATE"}\n` +
      `⚡ Always online: ${s.alwaysOnline ? "ON" : "OFF"}\n` +
      `⌨️ Auto typing: ${s.autoTyping ? "ON" : "OFF"}\n` +
      `🔧 Prefix: ${s.prefix}`
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
    key: "alwaysOnline" | "autoTyping" | "autoStatusView" | "autoStatusReact" | "autoChatEnabled",
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

  private async cmdChatScope(isOwner: boolean, args: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!isOwner) return void reply("This command is for the bot owner only.")
    const scope = args.trim().toLowerCase()
    if (!["dm", "groups", "all", "inbox"].includes(scope)) return void reply(`Chat scope is *${this.settings.chatScope || "dm"}*. Use dm, groups, all, or inbox.`)
    this.settings.chatScope = scope as BotSettings["chatScope"]
    await bots().updateOne({ number: this.number }, { $set: { "settings.chatScope": this.settings.chatScope, updatedAt: new Date() } })
    await reply(`Chatbot scope is now *${scope}*.`)
  }

  private async cmdTrain(isOwner: boolean, args: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!isOwner) return void reply("This command is for the bot owner only.")
    const persona = args.trim()
    if (!persona) return void reply(`Training is: *${this.settings.aiPersona || "not set"}*. Use ${this.settings.prefix}train <instructions>.`)
    this.settings.aiPersona = persona.slice(0, 2000)
    await bots().updateOne({ number: this.number }, { $set: { "settings.aiPersona": this.settings.aiPersona, updatedAt: new Date() } })
    await reply("Bot training instructions saved and active.")
  }

  private async cmdViewOnceMode(
    isOwner: boolean,
    args: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!isOwner) return void reply("This command is for the bot owner only.")
    const mode = args.trim().toLowerCase()
    if (mode !== "same" && mode !== "dm" && mode !== "private") {
      return void reply(`View-once mode is *${this.settings.viewOnceMode}*. Use ${this.settings.prefix}viewonce same or ${this.settings.prefix}viewonce dm.`)
    }
    this.settings.viewOnceMode = mode === "private" ? "dm" : mode
    await bots().updateOne({ number: this.number }, { $set: { "settings.viewOnceMode": this.settings.viewOnceMode, updatedAt: new Date() } })
    await reply(`View-once replies now go to *${this.settings.viewOnceMode === "same" ? "same chat" : "private DM"}*.`)
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
    
    // Determine where to send based on viewOnceMode setting
    let targetJid: string
    const isSameChat = this.settings.viewOnceMode === "same"
    
    if (isSameChat) {
      // Send to same chat where command was used
      targetJid = remoteJid
    } else {
      // Send to owner's DM (default "dm" mode)
      const ownerJid = this.ownJid()
      if (!ownerJid) {
        return void reply("Could not identify owner. Please try again.")
      }
      targetJid = ownerJid
    }
    
    console.log("[v0] VV command - mode:", this.settings.viewOnceMode, "target:", targetJid, "remote:", remoteJid)
    
    const key = {
      remoteJid: targetJid,
      id: ctx?.stanzaId || msg.key.id,
      fromMe: false,
      participant: ctx?.participant,
    } as WAMessage["key"]
    try {
      const ok = await this.recoverViewOnce(inner as proto.IMessage, key, targetJid)
      if (!ok) await reply("Could not unlock that media.")
      if (isSameChat) {
        await reply("✓ Unlocked! View-once media sent to this chat.")
      }
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
      // Check if message has a media file (document, audio, video, image)
      const msgMedia =
        msg?.message?.documentMessage ||
        msg?.message?.audioMessage ||
        msg?.message?.videoMessage ||
        msg?.message?.imageMessage

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
          const downloadedData = await downloadMediaMessage(msgMedia as any, "buffer", {}, { logger } as any)
          fileBuffer = downloadedData && Buffer.isBuffer(downloadedData) ? downloadedData : null
          
          if (!fileBuffer) {
            console.log("[v0] Downloaded data is not a buffer:", typeof downloadedData, downloadedData?.length)
            return void reply("Failed to extract file. Please try again.")
          }
          
          // Get file name from various message types
          if (msg?.message?.imageMessage) {
            fileName = `image_${Date.now()}.jpg`
          } else if (msg?.message?.videoMessage) {
            fileName = `video_${Date.now()}.mp4`
          } else if (msg?.message?.audioMessage) {
            fileName = `audio_${Date.now()}.mp3`
          } else if (msg?.message?.documentMessage) {
            fileName = (msg.message.documentMessage as any).fileName || `document_${Date.now()}.bin`
          } else {
            fileName = (msgMedia as any).fileName || `file_${Date.now()}`
          }
          
          console.log("[v0] Extracted media file for upload, name:", fileName, "size:", fileBuffer.length)
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

      // Track the uploaded image for .edit command usage
      if (msgMedia) {
        try {
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
          let fileType: "image" | "video" | "audio" | "document" = "document"
          
          if (msg?.message?.imageMessage) fileType = "image"
          else if (msg?.message?.videoMessage) fileType = "video"
          else if (msg?.message?.audioMessage) fileType = "audio"
          
          // File tracking removed for database optimization - keeping only session data
        } catch (trackErr) {
          logger.debug({ trackErr }, "file operation processed")
        }
      }

      const uploadMsg = `✅ *File Uploaded Successfully*\n\n📁 *Name:* ${uploadedFile.filename || "file"}\n🔗 *Link:* ${fileUrl}\n\n⏰ _Expires in 30 days_\n\nYou can now use: .edit <image-url> | <prompt>\n\nPowered by WhatsBot`

      await this.sock.sendMessage(remoteJid, { text: uploadMsg })
      await reply("✅ File uploaded!")
    } catch (err) {
      logger.debug({ err }, "file upload failed")
      console.log("[v0] Upload error:", err)
      await reply("Failed to upload file. Please try again.")
    }
  }

  private async cmdDrama(
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.sock) return
    const [action = "home", ...rest] = args.trim().split(/\s+/)
    const query = rest.join(" ")
    const base = "https://zimbox-api.top.co.zw/api/dramabox"
    const endpoints: Record<string, string> = {
      home: `${base}/home`,
      search: `${base}/search?q=${encodeURIComponent(query || "love")}&page=1`,
      detail: `${base}/detail?id=${encodeURIComponent(query)}`,
      category: `${base}/category?id=${encodeURIComponent(query)}&page=1`,
    }
    if (action === "help") {
      return void reply("Drama commands:\n.dramabox\n.dramabox search <keyword>\n.dramabox detail <id>\n.dramabox stream <dramaId> <chapterId>\n.dramadl <dramaId> <chapterId>\n.dramabox category <id>")
    }
    if (action === "download" || action === "stream") {
      const [dramaId, chapterId] = rest
      if (!dramaId || !chapterId) return void reply("Use .dramabox stream <dramaId> <chapterId>.")
      try {
        const response = await fetch(`${base}/stream?id=${encodeURIComponent(dramaId)}&chapter=${encodeURIComponent(chapterId)}`, { signal: AbortSignal.timeout(20000) })
        const data = await response.json().catch(() => null) as any
        const streamUrl = data?.data?.url || data?.data?.videoUrl || data?.url || data?.videoUrl
        if (!response.ok || !streamUrl) return void reply("That episode is not available right now.")
        await this.sock.sendMessage(remoteJid, { video: { url: streamUrl }, caption: `DramaBox episode\nhttps://zimbox.top.co.zw/?drama=${encodeURIComponent(dramaId)}&episode=${encodeURIComponent(chapterId)}`, mimetype: "video/mp4" })
        return
      } catch (error) {
        logger.warn({ error, remoteJid, action }, "drama stream failed")
        return void reply("Drama video timed out. Please try again shortly.")
      }
    }
    if (!endpoints[action] || (["detail", "category"].includes(action) && !query)) {
      return void reply("Use .dramabox, .dramabox search <keyword>, .dramabox detail <id>, .dramabox stream <dramaId> <chapterId>, or .dramabox category <id>.")
    }
    try {
      const response = await fetch(endpoints[action], { signal: AbortSignal.timeout(15000) })
      const data = await response.json().catch(() => null) as any
      if (!response.ok) return void reply("Drama service is temporarily unavailable. Please try again.")
      const results = data?.results || data?.data?.results || data?.data?.list || data?.data?.dramas || []
      if (["search", "home", "category"].includes(action)) {
        const list = Array.isArray(results) ? results.slice(0, 8) : []
        if (!list.length) return void reply("No dramas found.")
        const text = list.map((item: any, index: number) => {
          const player = `https://zimbox.top.co.zw/?drama=${encodeURIComponent(item.id)}&episode=${encodeURIComponent(item.chapterId || "latest")}`
          return `${index + 1}. ${item.title || "Untitled"}\nEpisodes: ${item.episodes || "?"} · ${item.genres?.join(", ") || "Drama"}\n${item.synopsis ? item.synopsis.slice(0, 180) : ""}\nPlayer: ${player}\nStream: .dramabox stream ${item.id} ${item.chapterId || ""}`
        }).join("\n\n")
        await this.sock.sendMessage(remoteJid, { text: `DramaBox ${action}\n\n${text}` })
        for (const item of list.slice(0, 3)) {
          if (item.cover) await this.sock.sendMessage(remoteJid, { image: { url: item.cover }, caption: `${item.title}\nhttps://zimbox.top.co.zw/player/${item.id}/${item.chapterId || "latest"}` })
        }
        return
      }
      const item = data?.data || data
      await reply(`DramaBox detail\n\n${item?.title || "Drama"}\n${item?.synopsis || ""}\nEpisodes: ${item?.episodes || "?"}\nPlayer: https://zimbox.top.co.zw/?drama=${encodeURIComponent(item?.id || query)}&episode=${encodeURIComponent(item?.chapterId || "latest")}`)
    } catch (error) {
      logger.warn({ error, remoteJid, action }, "drama command failed")
      await reply("Drama service timed out. Please try again shortly.")
    }
  }

  private async cmdVcf(remoteJid: string, reply: (b: string) => Promise<unknown>): Promise<void> {
    if (!this.sock) return

    try {
      const vcfMessage = `*WHATSAPP STATUS VIEW'S*

🚀 Say goodbye to downloading and importing VCF files every day!

Connect your Google Account once and let VCF Hostify automatically sync your contacts in the background. Fast, secure, and always up to date.

🌐 Visit: https://vcf.hostify.co.zw

━━━━━━━━━━━━━━━━━━━━━

✨ Why VCF Hostify?
• Auto sync from Google Contacts
• No manual uploads needed
• Always updated
• Secure & Fast
• 100% Free

🔗 https://vcf.hostify.co.zw

Powered by WhatsBot - World of Technology Team`

      await this.sock.sendMessage(remoteJid, { text: vcfMessage })
      await reply("✅ VCF Hostify info sent!")
    } catch (err) {
      logger.debug({ err }, "vcf command failed")
      console.log("[v0] VCF error:", err)
      await reply("Failed to send VCF info. Please try again.")
    }
  }

  private async cmdAutoReact(
    args: string,
    isOwner: boolean,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!isOwner) return void reply("Only bot owner can use this command.")

    const action = args.toLowerCase().trim()

    if (!action || !["on", "off", "status"].includes(action)) {
      const current = this.settings.autoStatusReact ? "ON" : "OFF"
      return void reply(
        `Current Status: Auto React is ${current}\n\n` +
          `Usage: .autoreact <action>\n\n` +
          `Actions:\n` +
          `• on — Turn on auto status reactions\n` +
          `• off — Turn off auto status reactions\n` +
          `• status — Show current status`,
      )
    }

    if (action === "status") {
      const current = this.settings.autoStatusReact ? "ON ✅" : "OFF ❌"
      return void reply(`Auto Status React is currently: ${current}`)
    }

    const newValue = action === "on"
    if (this.settings.autoStatusReact === newValue) {
      const status = newValue ? "already on" : "already off"
      return void reply(`Auto React is ${status}. No changes needed.`)
    }

    this.settings.autoStatusReact = newValue
    await this.saveSettings()

    const status = newValue ? "ON ✅" : "OFF ❌"
    await reply(`Auto Status React is now ${status}`)
    console.log(`[v0] Auto React toggled to ${newValue}`)
  }

  private async cmdQuote(
    args: string,
    remoteJid: string,
    reply: (b: string) => Promise<unknown>,
  ): Promise<void> {
    if (!this.sock) return

    try {
      let quote = ""
      let author = "Unknown"

      // Try primary API
      try {
        const apiUrl = `https://omegatech-api.dixonomega.tech/api/random/quotes`
        const response = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) })

        if (response.ok) {
          const data = (await response.json()) as any
          console.log("[v0] Quote API response:", JSON.stringify(data).substring(0, 200))

          // Try multiple response structures
          if (data?.result?.quote) {
            quote = data.result.quote || data.result.text || ""
            author = data.result.author || data.result.by || "Unknown"
          } else if (data?.quote) {
            quote = data.quote || data.text || ""
            author = data.author || data.by || "Unknown"
          } else if (data?.data?.quote) {
            quote = data.data.quote || data.data.text || ""
            author = data.data.author || data.data.by || "Unknown"
          } else if (Array.isArray(data) && data.length > 0) {
            const item = data[0]
            quote = item.quote || item.text || item.content || ""
            author = item.author || item.by || item.source || "Unknown"
          }
        }
      } catch (primaryErr) {
        console.log("[v0] Primary quote API failed:", primaryErr)
      }

      // Fallback to second API if first one fails
      if (!quote || quote.trim().length === 0) {
        try {
          const fallbackUrl = `https://api.quotable.io/random`
          const response = await fetch(fallbackUrl, { signal: AbortSignal.timeout(8000) })

          if (response.ok) {
            const data = (await response.json()) as any
            quote = data.content || data.quote || ""
            author = data.author || "Unknown"
            console.log("[v0] Using fallback quote API")
          }
        } catch (fallbackErr) {
          console.log("[v0] Fallback quote API failed:", fallbackErr)
        }
      }

      if (!quote || quote.trim().length === 0) {
        console.log("[v0] No quote found from any API")
        return void reply("Could not fetch quote. Please try again later.")
      }

      const formatted = `*"${quote}"*\n\n— ${author}\n\n━━━━━━━━━━━━━━━━━━\nPowered by WhatsBot`

      await this.sock.sendMessage(remoteJid, { text: formatted })
      await reply("✅ Quote sent!")
    } catch (err) {
      logger.debug({ err }, "quote command failed")
      console.log("[v0] Quote error:", err)
      await reply("Failed to send quote. Please try again.")
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
      console.log("[v0] Lyrics API response:", JSON.stringify(data).substring(0, 200))

      // Handle different response formats
      let lyrics: string | null = null
      let title = args
      let artist = "Unknown Artist"
      let lineCount = 0

      // Try different response structures
      if (data?.lyrics) {
        lyrics = data.lyrics
        title = data.title || data.name || args
        artist = data.artist || data.author || "Unknown Artist"
        lineCount = data.lineCount || data.lines || (lyrics ? lyrics.split("\n").length : 0)
      } else if (data?.result?.lyrics) {
        lyrics = data.result.lyrics
        title = data.result.title || data.result.name || args
        artist = data.result.artist || data.result.author || "Unknown Artist"
        lineCount = data.result.lineCount || data.result.lines || (lyrics ? lyrics.split("\n").length : 0)
      } else if (data?.data?.lyrics) {
        lyrics = data.data.lyrics
        title = data.data.title || data.data.name || args
        artist = data.data.artist || data.data.author || "Unknown Artist"
        lineCount = data.data.lineCount || data.data.lines || (lyrics ? lyrics.split("\n").length : 0)
      }

      if (!lyrics || lyrics.trim().length === 0) {
        return void reply(`No lyrics found for "${args}". Try a different song.`)
      }

      // Format lyrics in a professional WhatsApp-friendly way
      const header = `���� *${title.toUpperCase()}*\n_${artist}_\n\n━━━━━━━━━━━━━━━━━━━━━`
      
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
        const parts = args.split("|")
        const imgPart = parts[0]?.trim() || ""
        const promptPart = parts[1]?.trim() || ""
        
        if (imgPart.startsWith("http")) {
          imageUrl = imgPart
          prompt = promptPart
        } else {
          // If first part is not a URL, treat whole thing as prompt
          prompt = args.trim()
        }
        console.log("[v0] Edit with URL - imageUrl:", imageUrl ? "set" : "none", "prompt:", prompt)
      }

      // Strategy 2: Check for quoted/replied image
      if (!imageUrl && msg) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        if (quoted?.imageMessage) {
          try {
            const downloadedData = await downloadMediaMessage(
              { key: msg.key, message: { imageMessage: { ...quoted.imageMessage, mimetype: quoted.imageMessage.mimetype || "image/jpeg" } } } as WAMessage,
              "buffer",
              {},
              { logger } as any,
            )
            if (downloadedData && Buffer.isBuffer(downloadedData)) {
              const base64 = downloadedData.toString("base64")
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
            const downloadedData = await downloadMediaMessage(
              { key: msg.key, message: { imageMessage: { ...msgImage, mimetype: msgImage.mimetype || "image/jpeg" } } } as WAMessage,
              "buffer",
              {},
              { logger } as any,
            )
            if (downloadedData && Buffer.isBuffer(downloadedData)) {
              const base64 = downloadedData.toString("base64")
              imageUrl = `data:image/jpeg;base64,${base64}`
              console.log("[v0] Extracted direct image, size:", base64.length)
            }
          } catch (dirErr) {
            console.log("[v0] Failed to extract direct image:", dirErr)
          }
        }
      }

      // Strategy 4: Check for document message (image files from file picker)
      if (!imageUrl && msg) {
        const msgDoc = msg.message?.documentMessage
        if (msgDoc) {
          const fileName = (msgDoc as any).fileName || ""
          const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]
          const isImage = imageExtensions.some((ext) => fileName.toLowerCase().endsWith(ext))

          if (isImage) {
            try {
              const downloadedData = await downloadMediaMessage(
                { key: msg.key, message: { documentMessage: { ...msgDoc, mimetype: msgDoc.mimetype || "image/jpeg" } } } as WAMessage,
                "buffer",
                {},
                { logger } as any,
              )
              if (downloadedData && Buffer.isBuffer(downloadedData)) {
                const base64 = downloadedData.toString("base64")
                imageUrl = `data:image/jpeg;base64,${base64}`
                console.log("[v0] Extracted document image:", fileName, "size:", base64.length)
              }
            } catch (docErr) {
              console.log("[v0] Failed to extract document image:", docErr)
            }
          }
        }
      }

      // Strategy 5: Check for quoted document message
      if (!imageUrl && msg) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
        if (quoted?.documentMessage) {
          const fileName = (quoted.documentMessage as any).fileName || ""
          const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]
          const isImage = imageExtensions.some((ext) => fileName.toLowerCase().endsWith(ext))

          if (isImage) {
            try {
              const downloadedData = await downloadMediaMessage(
                { key: msg.key, message: { documentMessage: { ...quoted.documentMessage, mimetype: quoted.documentMessage.mimetype || "image/jpeg" } } } as WAMessage,
                "buffer",
                {},
                { logger } as any,
              )
              if (downloadedData && Buffer.isBuffer(downloadedData)) {
                const base64 = downloadedData.toString("base64")
                imageUrl = `data:image/jpeg;base64,${base64}`
                console.log("[v0] Extracted quoted document image:", fileName, "size:", base64.length)
              }
            } catch (quotedDocErr) {
              console.log("[v0] Failed to extract quoted document image:", quotedDocErr)
            }
          }
        }
      }

      if (!imageUrl) {
        return void reply(
          "❌ No image found. Please:\n\n" +
            "1️⃣ Reply to an image with: .edit <prompt>\n" +
            "2️⃣ Send image with caption: .edit <prompt>\n" +
            "3️⃣ Send document (jpg, png, etc) with caption: .edit <prompt>\n" +
            "4️⃣ Or use URL: .edit <image-url> | <prompt>",
        )
      }

      if (!prompt) {
        return void reply("Please provide a prompt for image editing.\n\nExample: Remove background and add sunset")
      }

      // The editor accepts a remote URL, not a multi-megabyte data URI.
      // Upload downloaded WhatsApp media first so the request stays within URL limits.
      if (imageUrl.startsWith("data:")) {
        const comma = imageUrl.indexOf(",")
        const encoded = comma >= 0 ? imageUrl.slice(comma + 1) : ""
        const mediaBuffer = Buffer.from(encoded, "base64")
        const form = new FormData()
        form.append("files", new Blob([mediaBuffer], { type: "image/jpeg" }), "edit-image.jpg")
        const upload = await fetch("https://omegatech-api.dixonomega.tech/api/tools/Top4top-uploader", {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(60000),
        })
        const uploadData = await upload.json().catch(() => null) as any
        imageUrl = uploadData?.data?.files?.[0]?.url || ""
        if (!upload.ok || !imageUrl) {
          logger.warn({ number: this.number, status: upload.status }, "edit media upload failed")
          return void reply("I could not upload that image for editing. Please try a smaller image or use an image URL.")
        }
      }

      await reply("🎨 Processing your image with nano-banana2...\n⏳ This takes 30-60 seconds...")

      // Step 1: Submit the image URL and prompt to start processing
      const submitUrl =
        `https://omegatech-api.dixonomega.tech/api/ai/nano-banana2?image=${encodeURIComponent(imageUrl)}&prompt=${encodeURIComponent(prompt)}`

      let submitRes: Response
      try {
        submitRes = await fetch(submitUrl, { signal: AbortSignal.timeout(30000) })
      } catch (fetchErr) {
        console.log("[v0] Nano banana2 fetch error:", fetchErr)
        return void reply("Network error. Please check your connection and try again.")
      }
      
      if (!submitRes.ok) {
        console.log("[v0] Nano banana2 submit failed:", submitRes.status, await submitRes.text())
        return void reply("Image processing service error. Please try again with a different image.")
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

      // Image tracking removed for database optimization

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
      const result = data?.result ?? data?.data ?? data
      const downloadUrl = result?.download_url ?? result?.downloadUrl ?? result?.url ?? result?.audio
      if (!result || !downloadUrl) return void reply("No playable song was found. Try a different search.")
      const title = result.title || "Unknown"
      const duration = result.duration || "Unknown"
      const views = result.views ? (result.views > 1000000 ? Math.floor(result.views / 1000000) + "M" : Math.floor(result.views / 1000) + "K") : "N/A"
      const thumbnail = result.thumbnail || ""
      const playableUrl = String(downloadUrl)

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

      if (playableUrl) {
        // Send the audio file through the same search result path.
        await this.sock.sendMessage(remoteJid, {
          audio: { url: playableUrl },
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.clearSettingsRefreshTimer()
    this.clearCacheClearTimer()
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
    this.clearSettingsRefreshTimer()
    this.clearCacheClearTimer()
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

  async broadcastImageToGroups(image: Buffer, caption = ""): Promise<{ sent: number; failed: number }> {
    if (!this.sock || !this.isConnected()) throw new Error("WhatsApp session is not connected")
    if (!image.length || image.length > 8 * 1024 * 1024) throw new Error("Image must be between 1 byte and 8MB")
    const groups = await this.sock.groupFetchAllParticipating()
    const jids = Object.keys(groups)
    let sent = 0
    let failed = 0
    for (const jid of jids) {
      try {
        await this.sock.sendMessage(jid, { image, caption })
        sent++
        await new Promise((resolve) => setTimeout(resolve, 250))
      } catch (err) {
        failed++
        logger.debug({ err, jid }, "group status broadcast failed")
      }
    }
    return { sent, failed }
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
      if (quoted?.imageMessage || quoted?.videoMessage) {
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
      let sender = msg.key.participant || msg.key.remoteJid
      
      // Normalize sender JID (remove device ID if present: "12345:6@..." -> "12345@...")
      if (sender?.includes(":")) {
        sender = sender.split(":")[0] + "@s.whatsapp.net"
      }
      
      // Check if sender is bot owner
      const ownerJid = this.ownJid()
      const isBotOwner = sender === ownerJid
      
      console.log("[v0] AntiLink - Sender:", sender, "Owner:", ownerJid, "IsBotOwner:", isBotOwner)
      
      // Check if sender is group admin
      let isAdmin = false
      try {
        const groupMetadata = await this.sock.groupMetadata(remoteJid)
        const senderInGroup = groupMetadata.participants.find((p) => {
          let pId = p.id
          if (pId?.includes(":")) {
            pId = pId.split(":")[0] + "@s.whatsapp.net"
          }
          return pId === sender
        })
        isAdmin = senderInGroup?.isAdmin || false
        console.log("[v0] AntiLink - IsAdmin:", isAdmin, "SenderInGroup:", senderInGroup?.id)
      } catch (adminErr) {
        console.log("[v0] Failed to check group admin status:", adminErr)
        return void reply("Failed to verify permissions. Please try again.")
      }

      const action = args?.toLowerCase().trim() || "status"

      // Allow only owner and admins to configure
      if (!isBotOwner && !isAdmin) {
        return
      }

      if (action === "on" || action === "enable") {
        this.settings.antiLink = {
          ...(this.settings.antiLink || { groupJid: remoteJid, warnings: {} }),
          enabled: true,
          groupJid: remoteJid,
        }
        await this.saveSettings()
        await reply(
          `✓ Anti-link enabled for this group.\n\n` +
          `System works like this:\n` +
          `1️⃣ First link detected → Warn user\n` +
          `2️⃣ 3rd violation → Final warning\n` +
          `3️⃣ 5th violation → User gets kicked\n\n` +
          `Blocked domains:\n` +
          `• WhatsApp, YouTube, Instagram, Facebook, TikTok\n\n` +
          `Admins bypass all restrictions.`,
        )
      } else if (action === "off" || action === "disable") {
        this.settings.antiLink = {
          ...(this.settings.antiLink || { groupJid: remoteJid, warnings: {} }),
          enabled: false,
          groupJid: remoteJid,
        }
        await this.saveSettings()
        await reply(
          `✓ Anti-link disabled for this group.\n\n` +
          `The bot will ignore links until an admin enables it again.\n\n` +
          `Blocked domains remain available with .antilink list:\n` +
          `• Spam links\n` +
          `• Malicious URLs\n` +
          `• External redirects\n\n` +
          `Group admins and bot owner are exempt.`,
        )
      } else if (action === "list") {
        await reply(
          `🔗 *Blocked Domains*\n\n` +
            `SOCIAL MEDIA:\n` +
            `• WhatsApp (chat.whatsapp.com)\n` +
            `• YouTube (youtube.com, youtu.be)\n` +
            `• Instagram (instagram.com, ig.me)\n` +
            `• Facebook (facebook.com, fb.me)\n` +
            `• TikTok (tiktok.com, vt.tiktok.com)\n\n` +
            `FILE DOWNLOAD SERVICES:\n` +
            `• MEGA, MediaFire, Zippyshare\n` +
            `• SendSpace, Dropbox, Google Drive\n` +
            `• 1Fichier, and other download sites\n\n` +
            `⚡ *Action Sequence*:\n` +
            `1st → 2nd → Final Warning → KICK\n\n` +
            `✅ *Exemptions*: Bot owner, group admins`,
        )
      } else {
        await reply(
          `Anti-link Status: ${this.settings.antiLink?.enabled === true ? "ON" : "OFF"}\n\n` +
            `Usage: .antilink <action>\n\n` +
            `• on - Enable enforcement in this group\n` +
            `• off - Disable enforcement in this group\n` +
            `• list - Show all blocked domains\n` +
            `• status - Show this message`,
        )
      }
    } catch (err) {
      logger.debug({ err }, "antilink failed")
      await reply("Failed to configure anti-link.")
    }
  }

  private async cmdAutoStatus(args: string[], reply: (b: string) => Promise<unknown>): Promise<void> {
    const action = (args[0] || "status").toLowerCase()
    const prefix = this.settings.prefix
    
    if (action === "on" || action === "enable") {
      this.settings.autoStatusView = true
      await this.saveSettings()
      await reply("✅ *Auto Status View Enabled*\n\nBot will now automatically view status updates.")
    } else if (action === "off" || action === "disable") {
      this.settings.autoStatusView = false
      await this.saveSettings()
      await reply("❌ *Auto Status View Disabled*\n\nBot will no longer automatically view status.")
    } else {
      const status = this.settings.autoStatusView ? "ON ✅" : "OFF ❌"
      const delay = ((this.settings as any).autoStatusViewDelay || 0)
      await reply(
        `*Auto Status View Status:* ${status}\n\n` +
        `Current delay: ${delay}s\n\n` +
        `Usage: ${prefix}autostatus <on|off>`
      )
    }
  }

  private async cmdAutoLike(args: string[], reply: (b: string) => Promise<unknown>): Promise<void> {
    const action = (args[0] || "status").toLowerCase()
    const prefix = this.settings.prefix
    
    if (action === "on" || action === "enable") {
      (this.settings as any).autoLikeStatus = true
      await this.saveSettings()
      await reply("❤️ *Auto Like Enabled*\n\nBot will automatically like status updates with heart emoji.")
    } else if (action === "off" || action === "disable") {
      (this.settings as any).autoLikeStatus = false
      await this.saveSettings()
      await reply("💔 *Auto Like Disabled*\n\nBot will no longer automatically like status.")
    } else {
      const status = ((this.settings as any).autoLikeStatus) ? "ON ❤️" : "OFF 💔"
      const delay = ((this.settings as any).autoLikeDelay || 2)
      await reply(
        `*Auto Like Status:* ${status}\n\n` +
        `Current delay: ${delay}s\n\n` +
        `Usage: ${prefix}autolike <on|off>`
      )
    }
  }

  private async cmdAutoChat(args: string[], reply: (b: string) => Promise<unknown>): Promise<void> {
    const action = (args[0] || "status").toLowerCase()
    const prefix = this.settings.prefix
    
    if (action === "on" || action === "enable") {
      (this.settings as any).autoChatEnabled = true
      await this.saveSettings()
      await reply(
        "🤖 *AutoChat Enabled*\n\n" +
        "Bot will now automatically reply to DM messages using AI.\n\n" +
        "The bot will respond to any direct message without needing to be mentioned."
      )
    } else if (action === "off" || action === "disable") {
      (this.settings as any).autoChatEnabled = false
      await this.saveSettings()
      await reply("🔇 *AutoChat Disabled*\n\nBot will no longer automatically reply to DMs.")
    } else {
      const status = ((this.settings as any).autoChatEnabled) ? "ON ��" : "OFF 🔇"
      await reply(
        `*AutoChat Status:* ${status}\n\n` +
        `AutoChat uses AI to intelligently respond to all DM messages.\n\n` +
        `Usage: ${prefix}autochat <on|off>`
      )
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

      const emojiList = this.settings.statusReactEmojis?.split(",").filter((e) => e) || ["❤���"]
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
      const prankId = randomUUID()

      // Validate URL
      try {
        new URL(url)
      } catch {
        return void reply("Invalid URL provided.")
      }

      await reply("⏳ Creating prank session...")

      // Create prank session with a traceable, non-secret reference.
      const createResponse = await fetch("https://coder.nx.kg/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, prankId }),
        signal: AbortSignal.timeout(15000),
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
        `Session: ${sessionId}\n` +
        `Reference: ${prankId}`

      await this.sock.sendMessage(remoteJid, { text: prankMessage })
      await reply(`✓ Prank sent! Session ID: ${sessionId}\nReference: ${prankId}`)
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

      await reply("���� Downloading from social media...")

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
        `🎨 *AI Image Generation (Pro)*\n\n` +
          `Usage: .img <prompt> [--luminux]\n\n` +
          `*Options:*\n` +
          `• Add --luminux for best quality (Luminux XGold)\n` +
          `• Without flag: Uses Omegatech Nano Banana Pro\n\n` +
          `*Examples:*\n` +
          `• .img cyberpunk city with neon lights, realistic style\n` +
          `• .img anime boy in spring blossoms --luminux\n` +
          `• .img detailed fantasy castle, ultra HD\n\n` +
          `Both models generate stunning, high-quality images!`,
      )
    }

    if (!this.sock) return

    try {
      const args_str = args.trim()
      const useLuminux = args_str.includes("--luminux")
      const prompt = args_str.replace("--luminux", "").trim()

      if (!prompt) {
        return void reply("Please provide a prompt for image generation.")
      }

      const modelName = useLuminux ? "Luminux XGold" : "Omegatech Nano Banana Pro"
      await reply(`🎨 Generating with ${modelName}...\n⏳ This may take 30-60 seconds...`)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 180000) // 3 min timeout

      let imageUrl: string | null = null
      let data: any

      if (useLuminux) {
        // Use Luminux XGold for best quality
        const luminuxUrl = `https://luminux-models.netlify.app/image`
        const params = new URLSearchParams({
          model: "lumi-xgold",
          prompt: prompt,
        })

        const response = await fetch(`${luminuxUrl}?${params.toString()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Luminux API error: ${response.status}`)
        }

        data = await response.json()
        if (data?.status && data?.image_url) {
          imageUrl = data.image_url
        }
      } else {
        // Use Omegatech Nano Banana Pro
        const nanoUrl = `https://api.omegatech.app/api/ai/nano-banana-pro`
        const params = new URLSearchParams({ prompt })

        const response = await fetch(`${nanoUrl}?${params.toString()}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Omegatech API error: ${response.status}`)
        }

        data = await response.json()
        if (data?.success && data?.image) {
          imageUrl = data.image
        }
      }

      clearTimeout(timeout)

      if (!imageUrl) {
        console.log("[v0] Image generation response:", JSON.stringify(data).substring(0, 300))
        return void reply("❌ No image was generated. Try a different prompt or model.")
      }

      // Download the bytes
      const imageBuffer = await this.fetchImage(imageUrl)

      if (!imageBuffer) {
        return void reply(`✓ Image generated (open the link):\n${imageUrl}`)
      }

      try {
        const modelInfo = useLuminux ? "Luminux XGold" : "Omegatech Nano Banana Pro"
        await this.sock.sendMessage(remoteJid, {
          image: imageBuffer,
          caption: `✨ *AI Generated Image*\n\n📝 Prompt: ${prompt}\n\n🤖 Model: ${modelInfo}\n\nPowered by WhatsBot`,
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

  private async isSenderGroupAdmin(msg: WAMessage, groupJid: string): Promise<boolean> {
    if (!this.sock) return false
    const sender = (msg.key.participant || msg.key.remoteJid || "").split(":")[0]
    if (!sender) return false
    const metadata = await this.sock.groupMetadata(groupJid)
    const participant = metadata.participants.find((item) => item.id.split(":")[0] === sender)
    return Boolean(participant?.admin)
  }

  private async isBotGroupAdmin(groupJid: string): Promise<boolean> {
    if (!this.sock?.user?.id) return false
    const metadata = await this.sock.groupMetadata(groupJid)
    const bot = metadata.participants.find((item) => item.id.split(":")[0] === this.sock?.user?.id.split(":")[0])
    return Boolean(bot?.admin)
  }

  // Group Work: Message counting and locking
  private async handleGroupWorkCounting(msg: WAMessage, groupJid: string): Promise<void> {
    if (!msg.message || msg.key.fromMe) return
    if (!(await this.isBotGroupAdmin(groupJid))) return

    const isLocked = this.isGroupLocked(groupJid)
    if (isLocked) {
      // Group is locked - ignore messages
      return
    }

    // Increment message count
    const tracker = this.groupWorkTracking.get(groupJid) || {
      messageCount: 0,
      isLocked: false,
      lockedAt: null,
      lockTimer: null,
    }
    tracker.messageCount++
    this.groupWorkTracking.set(groupJid, tracker)

    // Check if threshold reached
    if (tracker.messageCount >= this.settings.groupWorkThreshold) {
      // Lock the group
      tracker.isLocked = true
      tracker.lockedAt = Date.now()
      this.groupWorkTracking.set(groupJid, tracker)

  // Apply the real WhatsApp announcement setting, then announce it.
  if (this.sock) {
    await this.sock.groupSettingUpdate(groupJid, "announcement")
    const lockMsg = `Group locked after ${tracker.messageCount} messages. Only admins can send messages.`
    await this.sock.sendMessage(groupJid, { text: lockMsg })
  }

      // Set auto-unlock if enabled
      if (this.settings.groupAutoUnlockMinutes > 0) {
        if (tracker.lockTimer) clearTimeout(tracker.lockTimer)
        tracker.lockTimer = setTimeout(() => {
          this.unlockGroup(groupJid)
        }, this.settings.groupAutoUnlockMinutes * 60 * 1000)
        this.groupWorkTracking.set(groupJid, tracker)
      }
    }
  }

  private isGroupLocked(groupJid: string): boolean {
    const tracker = this.groupWorkTracking.get(groupJid)
    return tracker?.isLocked ?? false
  }

  private async unlockGroup(groupJid: string): Promise<void> {
    const tracker = this.groupWorkTracking.get(groupJid)
    if (!tracker) return

    tracker.isLocked = false
    tracker.messageCount = 0
    tracker.lockedAt = null
    if (tracker.lockTimer) clearTimeout(tracker.lockTimer)
    tracker.lockTimer = null
    this.groupWorkTracking.set(groupJid, tracker)

  // Restore the normal WhatsApp group setting, then announce unlock.
  try {
  if (this.sock) {
  await this.sock.groupSettingUpdate(groupJid, "not_announcement")
  await this.sock.sendMessage(groupJid, { text: "Group unlocked. Messages can be sent freely again." })
  }
    } catch (err) {
      logger.debug({ err }, "failed to announce unlock")
    }
  }

  // Group Work Commands
  private async cmdGroupWork(remoteJid: string, msg: WAMessage, reply: (text: string) => Promise<any>): Promise<void> {
    const isGroup = remoteJid.endsWith("@g.us")
    if (!isGroup) {
      await reply("This command only works in groups.")
      return
    }
    if (!(await this.isSenderGroupAdmin(msg, remoteJid))) return
    if (!(await this.isBotGroupAdmin(remoteJid))) return void reply("I need to be a group admin to enable auto-lock.")
    this.settings.groupWorkEnabled = true
    await this.saveSettings()
    
    // Initialize or reset group tracking
    const tracker = this.groupWorkTracking.get(remoteJid) || {
      messageCount: 0,
      isLocked: false,
      lockedAt: null,
      lockTimer: null,
    }
    tracker.messageCount = 0
    this.groupWorkTracking.set(remoteJid, tracker)
    
    await reply(`✅ Group work mode activated!\n\n📊 Threshold: ${this.settings.groupWorkThreshold} messages\n⏰ Auto-unlock: ${this.settings.groupAutoUnlockMinutes > 0 ? this.settings.groupAutoUnlockMinutes + ' minutes' : 'Manual only'}\n\nMessages will be counted until threshold is reached.`)
  }

  private async cmdGroupCount(remoteJid: string, reply: (text: string) => Promise<any>): Promise<void> {
    const isGroup = remoteJid.endsWith("@g.us")
    if (!isGroup) {
      await reply("This command only works in groups.")
      return
    }
    
    const tracker = this.groupWorkTracking.get(remoteJid)
    const count = tracker?.messageCount ?? 0
    const threshold = this.settings.groupWorkThreshold
    const locked = tracker?.isLocked ?? false
    const percent = Math.round((count / threshold) * 100)
    
    const bar = "▓".repeat(Math.round(percent / 5)) + "░".repeat(20 - Math.round(percent / 5))
    await reply(`*Group Message Count*\n\n📊 Progress: ${count}/${threshold} messages\n${bar} ${percent}%\n\n${locked ? '🔒 Status: LOCKED' : '🔓 Status: Open'}`)
  }

  private async cmdGroupUnlock(remoteJid: string, reply: (text: string) => Promise<any>): Promise<void> {
    const isGroup = remoteJid.endsWith("@g.us")
    if (!isGroup) {
      await reply("This command only works in groups.")
      return
    }
    
    this.unlockGroup(remoteJid)
    await reply("🔓 Group unlocked! Message count reset. Messages can be sent freely again.")
  }

  private async cmdUnlock(remoteJid: string, reply: (text: string) => Promise<any>): Promise<void> {
    await reply("*Unlock Commands*\n\n.gunlock - Unlock group after reaching message threshold\n.gcount - View current message count\n\n*Anti-Spam Locks* (when enabled):\n.unlock - Unlock yourself from anti-spam")
  }

  private async cmdLocks(remoteJid: string, reply: (text: string) => Promise<any>): Promise<void> {
    const isGroup = remoteJid.endsWith("@g.us")
    if (!isGroup) {
      await reply("This command only works in groups.")
      return
    }
    
    const tracker = this.groupWorkTracking.get(remoteJid)
    if (!tracker?.isLocked) {
      await reply("*Active Locks*\n\nNo active locks in this group. Group is open.")
      return
    }
    
    const lockedTime = tracker.lockedAt ? new Date(tracker.lockedAt).toLocaleTimeString() : "unknown"
    const autoUnlockTime = this.settings.groupAutoUnlockMinutes > 0 
      ? new Date(tracker.lockedAt! + this.settings.groupAutoUnlockMinutes * 60 * 1000).toLocaleTimeString()
      : "Manual unlock only"
    
    await reply(`*Active Locks*\n\n🔒 Group is currently LOCKED\n⏰ Locked at: ${lockedTime}\n🔓 Will unlock: ${autoUnlockTime}`)
  }
}
