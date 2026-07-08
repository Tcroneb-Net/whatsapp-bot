// Shared domain types used by the dashboard (and mirrored by the bot engine).

export type ViewOnceMode = "same" | "dm"

export interface BotSettings {
  // Display name the bot uses in alive/ping replies and self-references.
  botName: string
  // Automatically view (mark seen) status/story updates from contacts.
  autoStatusView: boolean
  // React to status updates automatically.
  autoStatusReact: boolean
  // Where recovered view-once media should be sent.
  viewOnceMode: ViewOnceMode
  // Enable saving view-once media at all.
  antiViewOnce: boolean
  // Respond to .alive command.
  aliveEnabled: boolean
  // Respond to .ping command.
  pingEnabled: boolean
  // Command prefix (e.g. "." or "!").
  prefix: string
  // Enable AI / download / search commands (powered by Hostify API).
  aiEnabled: boolean
  // Custom image shown on the welcome message and .menu (URL).
  welcomeImageUrl: string
  // Keep the account presence as "online" at all times.
  alwaysOnline: boolean
  // Show a "typing..." indicator before the bot replies to a command.
  autoTyping: boolean
  // Custom AI persona / instructions ("train" the AI for this bot).
  aiPersona: string
  // When true, anyone can use commands. When false, only the owner (you) can.
  publicMode: boolean
  // Custom emojis used for reacting to status updates (comma-separated).
  statusReactEmojis: string
  // Delay in seconds before auto viewing status (0 = instant).
  autoStatusViewDelay: number
  // Delay in seconds before auto reacting to status (0 = instant).
  autoStatusReactDelay: number
  // Auto-like status reactions (auto heart/like when viewing).
  autoLikeStatus: boolean
  // Delay in seconds before auto-liking status.
  autoLikeDelay: number
  // Auto-clear cache every N hours (0 = disabled).
  autoClearCacheHours: number
  // Last time cache was cleared.
  lastCacheClear?: Date
  // Auto-reply to DMs using AI when autochat is enabled.
  autoChatEnabled: boolean
  // Use AI to generate responses in autochat.
  autoChatUseAI: boolean
}

export interface BotDoc {
  // E.164 number without "+" (e.g. "2348012345678"). This is the primary key.
  number: string
  // bcrypt hash of the auto-generated dashboard password.
  passwordHash: string
  // Connection state reported by the engine.
  status: "pairing" | "connected" | "disconnected"
  settings: BotSettings
  plugins?: Plugin[]
  createdAt: Date
  updatedAt: Date
  lastSeen?: Date
}

export const DEFAULT_SETTINGS: BotSettings = {
  botName: "MyBot",
  autoStatusView: true,
  autoStatusReact: true,
  viewOnceMode: "dm",
  antiViewOnce: true,
  aliveEnabled: true,
  pingEnabled: true,
  prefix: ".",
  aiEnabled: true,
  welcomeImageUrl: "",
  alwaysOnline: false,
  autoTyping: false,
  aiPersona: "",
  publicMode: true,
  statusReactEmojis: "❤️,🔥,😍,👍,🎉",
  autoStatusViewDelay: 0,
  autoStatusReactDelay: 0,
  autoLikeStatus: false,
  autoLikeDelay: 2,
  autoClearCacheHours: 6,
  autoChatEnabled: false,
  autoChatUseAI: true,
}

// Settings the dashboard is allowed to update.
export interface Plugin {
  id: string
  name: string
  description: string
  apiUrl: string
  command: string
  enabled: boolean
  category?: "downloader" | "music" | "social" | "ai" | "tools" | "other"
  createdAt: Date
  updatedAt: Date
}

export interface BotPlugin extends Plugin {
  number: string
  responses?: string[]
}

export const EDITABLE_SETTING_KEYS: (keyof BotSettings)[] = [
  "botName",
  "autoStatusView",
  "autoStatusReact",
  "viewOnceMode",
  "antiViewOnce",
  "aliveEnabled",
  "pingEnabled",
  "prefix",
  "aiEnabled",
  "welcomeImageUrl",
  "alwaysOnline",
  "autoTyping",
  "aiPersona",
  "publicMode",
  "statusReactEmojis",
  "autoStatusViewDelay",
  "autoStatusReactDelay",
  "autoLikeStatus",
  "autoLikeDelay",
  "autoClearCacheHours",
  "autoChatEnabled",
  "autoChatUseAI",
]
