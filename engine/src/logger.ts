import pino from "pino"

// Configure pino logger - use JSON output for reliability across environments
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // Disable transport for now - pino-pretty requires additional setup
  // Output goes to stdout as JSON which can be parsed by log collectors
})

// Baileys expects a pino logger; use a quiet child so its internal logs don't flood.
export const baileysLogger = pino({ level: "silent" })

export function isCryptoNoise(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /bad mac|failed to decrypt|sender key/i.test(message)
}
