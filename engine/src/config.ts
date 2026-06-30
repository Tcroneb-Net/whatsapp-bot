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
  // Public site where users pair their number for free.
  pairUrl: process.env.PAIR_URL || "whatsbot.hostify.co.zw",
  // Branding shown on welcome / menu messages.
  teamName: process.env.TEAM_NAME || "World of Technology Team",
  sponsor: process.env.SPONSOR || "Hostify Zw Company",
  // Base URL for the Hostify API powering AI / search / download commands.
  hostifyApi: process.env.HOSTIFY_API || "https://api.hostify.co.zw",
  // Fallback image used on welcome / menu when the user hasn't set their own.
  defaultImageUrl:
    process.env.DEFAULT_IMAGE_URL ||
    "https://api.hostify.co.zw/file/whatsbot-banner.jpg",
}
