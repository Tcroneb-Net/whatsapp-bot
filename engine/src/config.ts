import "dotenv/config"

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const config = {
  port: Number(process.env.PORT || 8080),
  mongoUri: required("MONGODB_URI"),
  mongoDb: process.env.MONGODB_DB || "whatsapp_bot",
  // Shared secret the dashboard sends in the x-api-key header.
  apiKey: required("ENGINE_API_KEY"),
  // The WhatsApp channel (newsletter) every paired bot should follow + react to.
  // This is a JID like "120363xxxxxxxxxxxx@newsletter".
  channelJid: process.env.CHANNEL_JID || "",
  // Emoji used for channel auto-reactions and status reactions.
  reactEmoji: process.env.REACT_EMOJI || "❤️",
}
