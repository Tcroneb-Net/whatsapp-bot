import { BotSession } from "./bot-session.js"
import { bots, authState } from "./db.js"
import { logger } from "./logger.js"
import { DEFAULT_SETTINGS, type BotSettings } from "./types.js"

// Holds one BotSession per paired number and coordinates lifecycle.
class SessionManager {
  private sessions = new Map<string, BotSession>()
  private starting = new Map<string, Promise<BotSession>>()
  private reconnectAttempts = new Map<string, number>()
  get(number: string): BotSession | undefined {
    return this.sessions.get(number)
  }

  // On engine boot, restore every previously paired number that still has
  // credentials in MongoDB. This is the crash auto-restore behaviour.
  async restoreAll(): Promise<void> {
    const registered = await authState()
      .find({ key: "creds" })
      .project<{ number: string }>({ number: 1 })
      .toArray()

    logger.info({ count: registered.length }, "restoring sessions")

    const concurrency = 4
    for (let i = 0; i < registered.length; i += concurrency) {
      const batch = registered.slice(i, i + concurrency)
      await Promise.all(
        batch.map(({ number }) =>
          this.startSession(number).catch((err) =>
            logger.error({ number, err }, "failed to restore session"),
          ),
        ),
      )
    }
  }

  async startSession(number: string): Promise<BotSession> {
    const existing = this.sessions.get(number)
    if (existing) return existing
    const pending = this.starting.get(number)
    if (pending) return pending

    const promise = (async () => {
      const session = new BotSession(number)
      session.setTerminalDisconnectHandler(() => {
        if (this.sessions.get(number) === session) {
          this.sessions.delete(number)
          const attempt = (this.reconnectAttempts.get(number) ?? 0) + 1
          this.reconnectAttempts.set(number, attempt)
          const delay = Math.min(5000 * 2 ** (attempt - 1), 120000)
          logger.warn({ number, attempt, delay }, "scheduling session reconnect")
          setTimeout(() => {
            this.startSession(number).catch((err) => logger.error({ number, err, attempt }, "automatic session restart failed"))
          }, delay)
        }
      })
      this.sessions.set(number, session)
      try {
        await session.start()
        this.reconnectAttempts.delete(number)
        return session
      } catch (err) {
        this.sessions.delete(number)
        throw err
      } finally {
        this.starting.delete(number)
      }
    })()
    this.starting.set(number, promise)
    return promise
  }

  // Create (or reuse) a session and return a fresh pairing code for it.
  async requestPairing(number: string, password?: string): Promise<string> {
    let session = this.sessions.get(number)
    if (!session) {
      session = new BotSession(number)
      session.setTerminalDisconnectHandler(() => {
        if (this.sessions.get(number) === session) {
          this.sessions.delete(number)
          const attempt = (this.reconnectAttempts.get(number) ?? 0) + 1
          this.reconnectAttempts.set(number, attempt)
          const delay = Math.min(5000 * 2 ** (attempt - 1), 120000)
          logger.warn({ number, attempt, delay }, "scheduling session reconnect")
          setTimeout(() => {
            this.startSession(number).catch((err) => logger.error({ number, err, attempt }, "automatic session restart failed"))
          }, delay)
        }
      })
      this.sessions.set(number, session)
    }
    // Stash the plaintext password so the welcome DM can include it once the
    // user connects. Held in memory only — never written to disk.
    if (password) session.setPendingWelcomePassword(password)
    const code = await session.requestPairingCode()
    await bots().updateOne(
      { number },
      { $set: { status: "pairing", updatedAt: new Date() } },
    )
    return code
  }

  async refreshSettings(number: string): Promise<void> {
    let session = this.sessions.get(number)
    if (!session) session = await this.startSession(number)
    await session.refreshSettings()
  }

  async updateSettings(number: string, settings: Partial<BotSettings>): Promise<void> {
    const current = await bots().findOne({ number })
    const merged = { ...DEFAULT_SETTINGS, ...current?.settings, ...settings }
    await bots().updateOne(
      { number },
      { $set: { settings: merged, updatedAt: new Date() } },
      { upsert: false },
    )
    await this.refreshSettings(number)
  }

  async broadcastImage(number: string, image: Buffer, caption?: string) {
    const session = this.sessions.get(number)
    if (!session) throw new Error("Session not found")
    return session.broadcastImageToGroups(image, caption)
  }

  async deleteSession(number: string): Promise<void> {
    const session = this.sessions.get(number)
    if (session) {
      await session.logoutAndWipe()
      this.sessions.delete(number)
    } else {
      // No live session — still wipe any stored credentials.
      await authState().deleteMany({ number })
    }
  }

  async readyCount(): Promise<number> {
    return (await authState().find({ key: "creds" }).project({ _id: 1 }).toArray()).length
  }

  async status(number: string): Promise<{ status: string; connected: boolean; hasCredentials: boolean }> {
    let session = this.sessions.get(number)
    const credentials = await authState().findOne({ number, key: "creds" })
    const hasCredentials = Boolean(credentials)
    if (!session) {
      if (!hasCredentials) return { status: "disconnected", connected: false, hasCredentials: false }
      session = await this.startSession(number)
    }
    const connected = session.isConnected()
    return {
      status: connected ? "connected" : hasCredentials ? "restoring" : "pairing",
      connected,
      hasCredentials,
    }
  }
}

export const manager = new SessionManager()
