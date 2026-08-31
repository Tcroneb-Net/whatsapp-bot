import dotenv from "dotenv"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { existsSync } from "fs"

// Load .env from multiple locations in order of priority
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const envPaths = [
  join(__dirname, "..", "..", ".env.local"),
  join(__dirname, "..", "..", ".env.development.local"),
  join(__dirname, "..", "..", ".env"),
  join(process.cwd(), ".env.local"),
  join(process.cwd(), ".env.development.local"),
  join(process.cwd(), ".env"),
]

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    console.log(`[v0] Loading .env from: ${envPath}`)
    dotenv.config({ path: envPath })
    break
  }
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback
  if (value === undefined) {
    const envNames = Object.keys(process.env).filter(k => !k.startsWith('npm_')).join(', ')
    throw new Error(
      `Missing required environment variable: ${name}\n` +
      `Make sure it's set in .env file or environment.\n` +
      `Loaded env vars: ${envNames.substring(0, 200)}...`
    )
  }
  return value
}

export const config = {
  port: Number(process.env.PORT || 8080),
  mongoUri: required("MONGODB_URI", process.env.MONGODB_CONNECTION_STRING),
  mongoDb: process.env.MONGODB_DB || "whatsapp_bot",
  // Shared secret the dashboard sends in the x-api-key header.
  apiKey: required("ENGINE_API_KEY"),
  // The WhatsApp channel (newsletter) every paired bot should follow + react to.
  // This is a JID like "120363xxxxxxxxxxxx@newsletter".
  channelJid: process.env.CHANNEL_JID || "",
  // Pool of emojis used for random channel + status reactions.
  reactEmojis: (process.env.REACT_EMOJIS || "❤️,🔥,😍,👍,🎉,💯,⚡,🥰,😎,✨,🙌,👏")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean),
  // Public site where users pair their number for free.
  pairUrl: process.env.PAIR_URL || "whatsbot.hostify.co.zw",
  // Branding shown on welcome / menu messages.
  teamName: process.env.TEAM_NAME || "World of Technology Team",
  sponsor: process.env.SPONSOR || "Hostify Zw Company",
  // Base URL for the Hostify API powering AI / search / download commands.
  hostifyApi: process.env.HOSTIFY_API || "https://api.hostify.co.zw",
  // Public base URL where the bot images are hosted (your deployed dashboard,
  // e.g. https://your-app.vercel.app). Used to attach banners to messages.
  assetBase: (process.env.ASSET_BASE_URL || "").replace(/\/$/, ""),
  // Fallback image used on welcome / menu when no asset base or user image set.
  defaultImageUrl:
    process.env.DEFAULT_IMAGE_URL ||
    "https://i.ibb.co/Qj9Jp24v/file-000000003e2872469bf30fd1921de06c-2.png",
}

// Banner image filenames (served from the dashboard's public/ folder).
export const BANNERS = {
  welcome: "whatsbot-banner.png",
  menu: "menu-banner.png",
  system: "system-banner.png",
  media: "media-banner.png",
} as const

export type BannerCategory = keyof typeof BANNERS

// Resolve a public URL for a banner category, preferring the configured asset
// base (dashboard deployment) and falling back to the default image.
export function bannerUrl(category: BannerCategory): string {
  if (config.assetBase) return `${config.assetBase}/${BANNERS[category]}`
  return config.defaultImageUrl
}

// Resolve the local bundled banner file path (engine/assets) if it exists.
// This is the primary source so images always work without any remote host.
export function bannerFilePath(category: BannerCategory): string | null {
  // Compiled file lives at engine/dist/config.js, so assets are one level up.
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, "..", "assets", BANNERS[category]), // dist -> engine/assets
    join(here, "assets", BANNERS[category]),
    join(process.cwd(), "assets", BANNERS[category]),
    join(process.cwd(), "engine", "assets", BANNERS[category]),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

// Pick a random reaction emoji from a comma-separated list, falling back to defaults.
export function pickRandomEmoji(emojiList: string): string {
  const emojis = emojiList
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
  if (!emojis.length) return "❤️"
  return emojis[Math.floor(Math.random() * emojis.length)]
}

// Pick a random reaction emoji from the global configured pool (legacy).
export function randomEmoji(): string {
  const pool = config.reactEmojis.length ? config.reactEmojis : ["❤️"]
  return pool[Math.floor(Math.random() * pool.length)]
}
