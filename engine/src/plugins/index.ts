import type { BotPlugin } from "./types.js"

// Plugins are intentionally registered in one place so a future command can be
// enabled per engine instance without changing session lifecycle code.
export const plugins: BotPlugin[] = []

export const pluginNames = plugins.map((plugin) => plugin.name)
