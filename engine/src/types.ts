// Mirror of the dashboard's lib/types.ts so the engine and dashboard agree on
// the shape stored in MongoDB.

export type ViewOnceMode = "same" | "dm"

export interface AntiLinkSettings {
  enabled: boolean
  groupJid: string
  warnings: Record<string, number>
}

export interface BotSettings {
  botName: string
  autoStatusView: boolean
  autoStatusReact: boolean
  viewOnceMode: ViewOnceMode
  antiViewOnce: boolean
  antiLink?: AntiLinkSettings
  aliveEnabled: boolean
  pingEnabled: boolean
  pairCommandEnabled: boolean
  prefix: string
  aiEnabled: boolean
  welcomeImageUrl: string
  alwaysOnline: boolean
  autoTyping: boolean
  publicMode: boolean
  statusReactEmojis: string
  autoStatusViewDelay: number
  autoStatusReactDelay: number
  autoLikeStatus: boolean
  autoLikeDelay: number
  autoClearCacheHours: number
  autoChatEnabled: boolean
  autoChatUseAI: boolean
  chatScope: "dm" | "groups" | "all" | "inbox"
  aiPersona: string
  groupWorkEnabled: boolean
  groupWorkThreshold: number
  groupAutoUnlockMinutes: number
  groupWorkWhitelist: string[]
  antiSpamEnabled: boolean
  antiSpamMessagesPerMinute: number
  antiSpamAction: "warn" | "kick"
  antiSpamWarnings: number
  plugins?: Array<{ id: string; name: string; command: string; apiUrl: string; enabled: boolean; category?: string }>
}

export interface BotDoc {
  number: string
  passwordHash: string
  status: "pairing" | "connected" | "disconnected"
  settings: BotSettings
  createdAt: Date
  updatedAt: Date
  lastSeen?: Date
  plugins?: Array<{ id: string; name: string; command: string; apiUrl: string; enabled: boolean; category?: string }>
}

export const DEFAULT_SETTINGS: BotSettings = {
  botName: "Spider Mini Maximus",
  autoStatusView: true,
  autoStatusReact: true,
  viewOnceMode: "dm",
  antiViewOnce: true,
  antiLink: { enabled: false, groupJid: "", warnings: {} },
  aliveEnabled: true,
  pingEnabled: true,
  pairCommandEnabled: true,
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
  chatScope: "dm",
  groupWorkEnabled: false,
  groupWorkThreshold: 50,
  groupAutoUnlockMinutes: 0,
  groupWorkWhitelist: [],
  antiSpamEnabled: false,
  antiSpamMessagesPerMinute: 10,
  antiSpamAction: "warn",
  antiSpamWarnings: 3,
}
