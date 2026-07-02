// Mirror of the dashboard's lib/types.ts so the engine and dashboard agree on
// the shape stored in MongoDB.

export type ViewOnceMode = "same" | "dm"

export interface BotSettings {
  botName: string
  autoStatusView: boolean
  autoStatusReact: boolean
  viewOnceMode: ViewOnceMode
  antiViewOnce: boolean
  aliveEnabled: boolean
  pingEnabled: boolean
  prefix: string
  aiEnabled: boolean
  welcomeImageUrl: string
  alwaysOnline: boolean
  autoTyping: boolean
  aiPersona: string
  publicMode: boolean
  statusReactEmojis: string
  channelReactEmojis: string
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
