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
  // Custom emojis used for reacting to channel messages (comma-separated).
  channelReactEmojis: string
}

export interface BotDoc {
  // E.164 number without "+" (e.g. "2348012345678"). This is the primary key.
  number: string
  // bcrypt hash of the auto-generated dashboard password.
  passwordHash: string
  // Connection state reported by the engine.
  status: "pairing" | "connected" | "disconnected"
  settings: BotSettings
  createdAt: Date
  updatedAt: Date
  lastSeen?: Date
}

export const DEFAULT_SETTINGS: BotSettings = {
  botName: "MyBot",
  autoStatusView: true,
  autoStatusReact: false,
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
  channelReactEmojis: "❤️,🔥,😍,👍,🎉,💯,⚡,🥰,😎,✨",
}

// Settings the dashboard is allowed to update.
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
  "channelReactEmojis",
]
