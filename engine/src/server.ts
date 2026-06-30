import express from "express"
import type { Request, Response, NextFunction } from "express"
import { manager } from "./manager.js"
import { config } from "./config.js"
import { normalizeNumber } from "./util.js"
import { logger } from "./logger.js"

export function createServer() {
  const app = express()
  app.use(express.json())

  // Simple shared-secret auth between the dashboard and the engine.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/health") return next()
    const key = req.header("x-api-key")
    if (!config.apiKey || key !== config.apiKey) {
      return res.status(401).json({ error: "Unauthorized" })
    }
    next()
  })

  app.get("/health", (_req, res) => {
    res.json({ ok: true })
  })

  // Request a fresh 8-digit pairing code for a number.
  app.post("/pair", async (req: Request, res: Response) => {
    try {
      const number = normalizeNumber(String(req.body?.number || ""))
      if (!number) return res.status(400).json({ error: "Invalid number" })
      const code = await manager.requestPairing(number)
      res.json({ code })
    } catch (err) {
      logger.error({ err }, "pair failed")
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Connection status for a number.
  app.get("/status", (req: Request, res: Response) => {
    const number = normalizeNumber(String(req.query.number || ""))
    if (!number) return res.status(400).json({ error: "Invalid number" })
    res.json(manager.status(number))
  })

  // Tell a live session to reload settings from MongoDB.
  app.post("/refresh", async (req: Request, res: Response) => {
    const number = normalizeNumber(String(req.body?.number || ""))
    if (!number) return res.status(400).json({ error: "Invalid number" })
    await manager.refreshSettings(number)
    res.json({ ok: true })
  })

  // Log out + wipe stored credentials for a number.
  app.delete("/session", async (req: Request, res: Response) => {
    try {
      const number = normalizeNumber(String(req.body?.number || ""))
      if (!number) return res.status(400).json({ error: "Invalid number" })
      await manager.deleteSession(number)
      res.json({ ok: true })
    } catch (err) {
      logger.error({ err }, "delete session failed")
      res.status(500).json({ error: (err as Error).message })
    }
  })

  return app
}
