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
  logger.info("startup restore complete")

  // 4. Memory optimization: periodic cleanup and garbage collection
  setInterval(() => {
    if (global.gc) {
      global.gc()
    }
  }, 5 * 60 * 1000) // Every 5 minutes

  // Monitor memory usage
  setInterval(() => {
    const memUsage = process.memoryUsage()
    logger.debug({
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
    }, "memory usage")
  }, 10 * 60 * 1000) // Every 10 minutes
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
