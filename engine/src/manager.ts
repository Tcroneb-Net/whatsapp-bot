import { BotSession } from "./bot-session.js"
import { bots, authState } from "./db.js"
import { logger } from "./logger.js"

// Holds one BotSession per paired number and coordinates lifecycle.
class SessionManager {
  private sessions = new Map<string, BotSession>()
  private starting = new Map<string, Promise<BotSession>>()
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
          setTimeout(() => {
            this.startSession(number).catch((err) => logger.error({ number, err }, "automatic session restart failed"))
          }, 2500)
        }
      })
      this.sessions.set(number, session)
      try {
        await session.start()
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
          setTimeout(() => {
            this.startSession(number).catch((err) => logger.error({ number, err }, "automatic session restart failed"))
          }, 2500)
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

  async status(number: string): Promise<{ status: string; connected: boolean }> {
    let session = this.sessions.get(number)
    if (!session) {
      const credentials = await authState().findOne({ number, key: "creds" })
      if (!credentials) return { status: "disconnected", connected: false }
      session = await this.startSession(number)
    }
    const connected = session.isConnected()
    return {
      status: connected ? "connected" : "pairing",
      connected,
    }
  }
}

export const manager = new SessionManager()
