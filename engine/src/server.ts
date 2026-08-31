import express from "express"
import type { Request, Response, NextFunction } from "express"
import { manager } from "./manager.js"
import { config } from "./config.js"
import { normalizeNumber } from "./util.js"
import { logger } from "./logger.js"

export function createServer() {
  const app = express()
  // Status images are sent as base64 JSON. Keep the limit bounded but above
  // the dashboard's 8MB decoded-image limit (base64 adds roughly 33%).
  app.use(express.json({ limit: "16mb" }))

  // Simple shared-secret auth between the dashboard and the engine.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === "/health") return next()
    const key = req.header("x-api-key")
    if (!config.apiKey || key !== config.apiKey) {
      return res.status(401).json({ error: "Unauthorized" })
    }
    next()
  })

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true })
  })

  // Request a fresh 8-digit pairing code for a number.
  app.post("/pair", async (req: Request, res: Response) => {
    try {
      const number = normalizeNumber(String(req.body?.number || ""))
      if (!number) return res.status(400).json({ error: "Invalid number" })
      const password = req.body?.password ? String(req.body.password) : undefined
      const code = await manager.requestPairing(number, password)
      res.json({ code })
    } catch (err) {
      logger.error({ err }, "pair failed")
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Send one uploaded image to every group for a connected session.
  app.post("/broadcast/group-status", async (req: Request, res: Response) => {
    try {
      const number = normalizeNumber(String(req.body?.number || ""))
      const encoded = String(req.body?.imageBase64 || "")
      const caption = String(req.body?.caption || "").slice(0, 1024)
      if (!number || !encoded) return res.status(400).json({ error: "number and imageBase64 are required" })
      if (encoded.length > 11_000_000) return res.status(413).json({ error: "Image is too large" })
      const image = Buffer.from(encoded.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ""), "base64")
      const result = await manager.broadcastImage(number, image, caption)
      res.json(result)
    } catch (err) {
      logger.error({ err }, "group status broadcast failed")
      res.status(500).json({ error: (err as Error).message })
    }
  })

  // Connection status for a number.
  app.get("/status", async (req: Request, res: Response) => {
    const number = normalizeNumber(String(req.query.number || ""))
    if (!number) return res.status(400).json({ error: "Invalid number" })
    try {
      res.json(await manager.status(number))
    } catch (err) {
      logger.error({ number, err }, "status session wake failed")
      res.status(500).json({ error: "Could not wake bot session" })
    }
  })

  // Tell a live session to reload settings from MongoDB.
  const refreshSettings = async (req: Request, res: Response) => {
    const number = normalizeNumber(String(req.body?.number || req.params?.number || ""))
    if (!number) return res.status(400).json({ error: "Invalid number" })
    try {
      await manager.refreshSettings(number)
      res.json({ ok: true, number })
    } catch (err) {
      logger.error({ number, err }, "settings refresh failed")
      res.status(500).json({ error: "Could not refresh bot settings" })
    }
  }
  app.post("/refresh", refreshSettings)
  app.post("/session/:number/refresh-settings", refreshSettings)

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

  // Get live session status and current settings
  app.get("/session/:number/status", async (req: Request, res: Response) => {
    const number = normalizeNumber(String(req.params.number || ""))
    if (!number) return res.status(400).json({ error: "Invalid number" })
    
    // Wake a persisted session before reporting status. Previously the dashboard
    // saw "disconnected" until another endpoint happened to start the session.
    try {
      await manager.status(number)
    } catch (err) {
      logger.error({ number, err }, "status session wake failed")
      return res.status(503).json({ error: "Could not load bot session" })
    }
    const session = manager.get(number)
    if (!session) {
      return res.json({
        number,
        connected: false,
        status: "disconnected",
        settings: null,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      })
    }
    try {
      await session.refreshSettings()
    } catch (err) {
      logger.error({ number, err }, "status settings refresh failed")
      return res.status(503).json({ error: "Bot session settings unavailable" })
    }
    const connected = session.isConnected()

    res.json({
      number,
      connected,
      status: connected ? "connected" : "pairing",
      settings: session.getSettings(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  })

  // Keep oversized request failures machine-readable for the dashboard.
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err?.type === "entity.too.large" || err?.status === 413) {
      return res.status(413).json({ error: "Image payload is too large. Please use an image under 8MB." })
    }
    return next(err)
  })

  return app
}
