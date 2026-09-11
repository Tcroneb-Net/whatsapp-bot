import { config } from "./config.js"
import { connectDb } from "./db.js"
import { manager } from "./manager.js"
import { createServer } from "./server.js"
import { logger } from "./logger.js"

async function main() {
  // 1. Connect to MongoDB (shared with the dashboard).
  // connectDb() also ensures the required indexes exist.
  await connectDb()
  logger.info("connected to MongoDB")

  // 2. Start the control server the dashboard talks to.
  const app = createServer()
  app.listen(config.port, () => {
    logger.info({ port: config.port }, "engine HTTP server listening")
  })

  // 3. Crash auto-restore: bring every previously paired number back online.
  await manager.restoreAll()
  logger.info({ uptime: process.uptime() }, "startup restore complete")

  process.on("SIGTERM", () => {
    logger.info("received SIGTERM; allowing active sessions to close")
  })
  process.on("SIGINT", () => {
    logger.info("received SIGINT; allowing active sessions to close")
  })

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
