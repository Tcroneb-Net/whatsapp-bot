import { config } from "./config.js"
import { connectDb } from "./db.js"
import { manager } from "./manager.js"
import { createServer } from "./server.js"
import { logger } from "./logger.js"

async function main() {
  // Bind the health endpoint before database/session restoration. Deployment
  // platforms must be able to see the process as alive while Mongo or WhatsApp
  // sessions are reconnecting.
  const app = createServer()
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, "engine HTTP server listening")
  })

  try {
    // connectDb() also ensures the required indexes exist.
    await connectDb()
    logger.info("connected to MongoDB")

    // Restore every previously paired number after the process is healthy.
    await manager.restoreAll()
    logger.info({ uptime: process.uptime() }, "startup restore complete")
  } catch (err) {
    logger.error({ err }, "engine startup dependency failed")
    server.close(() => process.exit(1))
    return
  }

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down engine")
    server.close(() => process.exit(0))
  }
  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))

  // Keep runtime memory policy in the container/platform. Do not force GC on a
  // timer because it adds latency and hides leaks instead of fixing them.
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error")
  process.exit(1)
})

// Keep the process alive and log unexpected errors instead of crashing the
// whole engine (one bad session must not take everyone offline).
process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException")
})
process.on("unhandledRejection", (err) => {
  logger.error({ err }, "unhandledRejection")
})
