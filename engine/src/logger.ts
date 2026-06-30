import pino from "pino"

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : { target: "pino-pretty", options: { colorize: true } },
})

// Baileys expects a pino logger; use a quiet child so its internal logs don't flood.
export const baileysLogger = pino({ level: "silent" })
