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
  aiPersona: string
  publicMode: boolean
  statusReactEmojis: string
  autoStatusViewDelay: number
  autoStatusReactDelay: number
  autoLikeStatus: boolean
  autoLikeDelay: number
  autoClearCacheHours: number
  autoChatEnabled: boolean
  autoChatUseAI: boolean
  groupWorkEnabled: boolean
  groupWorkThreshold: number
  groupAutoUnlockMinutes: number
  groupWorkWhitelist: string[]
  antiSpamEnabled: boolean
  antiSpamMessagesPerMinute: number
  antiSpamAction: "warn" | "kick"
  antiSpamWarnings: number
}

export interface BotDoc {
  number: string
  passwordHash: string
  status: "pairing" | "connected" | "disconnected"
  settings: BotSettings
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
  antiLink: { enabled: false, groupJid: "", warnings: {} },
  aliveEnabled: true,
  pingEnabled: true,
  pairCommandEnabled: false,
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
  groupWorkEnabled: false,
  groupWorkThreshold: 50,
  groupAutoUnlockMinutes: 0,
  groupWorkWhitelist: [],
  antiSpamEnabled: false,
  antiSpamMessagesPerMinute: 10,
  antiSpamAction: "warn",
  antiSpamWarnings: 3,
}
