import { BotSession } from "./bot-session.js"
import { bots, authState } from "./db.js"
import { logger } from "./logger.js"

// Holds one BotSession per paired number and coordinates lifecycle.
class SessionManager {
  private sessions = new Map<string, BotSession>()

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

    for (const { number } of registered) {
      await this.startSession(number).catch((err) =>
        logger.error({ number, err }, "failed to restore session"),
      )
    }
  }

  async startSession(number: string): Promise<BotSession> {
    let session = this.sessions.get(number)
    if (session) return session
    session = new BotSession(number)
    this.sessions.set(number, session)
    await session.start()
    return session
  }

  // Create (or reuse) a session and return a fresh pairing code for it.
  async requestPairing(number: string, password?: string): Promise<string> {
    let session = this.sessions.get(number)
    if (!session) {
      session = new BotSession(number)
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
    await this.sessions.get(number)?.refreshSettings()
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

  status(number: string): { status: string; connected: boolean } {
    const session = this.sessions.get(number)
    return {
      status: session ? (session.isConnected() ? "connected" : "disconnected") : "disconnected",
      connected: Boolean(session?.isConnected()),
    }
  }
}

export const manager = new SessionManager()
