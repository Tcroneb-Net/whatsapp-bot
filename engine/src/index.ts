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

  // 4. Aggressive memory optimization to prevent resource exhaustion
  setInterval(() => {
    if (global.gc) {
      global.gc()
      const memUsage = process.memoryUsage()
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
      logger.info({
        heapUsed: heapUsedMB,
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      }, `GC cleanup complete (${heapUsedMB}MB)`)
      
      // Warn if memory usage is high
      if (heapUsedMB > 400) {
        logger.warn({ heapUsedMB }, "high memory usage detected")
      }
    }
  }, 2 * 60 * 1000) // Every 2 minutes for aggressive cleanup

  // Periodically stop idle sessions to free memory
  // Note: Session iteration removed since manager.sessions is private.
  // Sessions auto-cleanup happens through the socket/connection lifecycle.
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
