export type CommandCategory = "core" | "media" | "ai" | "social" | "tools" | "moderation"

export interface CommandDefinition {
  command: string
  aliases: string[]
  description: string
  category: CommandCategory
  ownerOnly?: boolean
}

export const COMMAND_CATALOG: CommandDefinition[] = [
  { command: "menu", aliases: ["help"], description: "Show all available commands", category: "core" },
  { command: "alive", aliases: [], description: "Check bot availability", category: "core" },
  { command: "ping", aliases: [], description: "Measure response latency", category: "core" },
  { command: "status", aliases: [], description: "Show live bot status", category: "core" },
  { command: "pair", aliases: ["pairwhats"], description: "Show pairing information", category: "core" },
  { command: "vv", aliases: ["viewonce", "vv2"], description: "Recover view-once media", category: "media" },
  { command: "edit", aliases: [], description: "Edit an image with an AI prompt", category: "media" },
  { command: "drama", aliases: ["dramabox", "dramas"], description: "Browse and search DramaBox", category: "media" },
  { command: "play", aliases: ["song", "ytmp3"], description: "Find and download audio", category: "media" },
  { command: "ai", aliases: ["gpt"], description: "Ask the bot an AI question", category: "ai" },
  { command: "music", aliases: ["suno", "remusic", "rm"], description: "Generate AI music", category: "ai" },
  { command: "translate", aliases: ["tr"], description: "Translate text", category: "ai" },
  { command: "lyrics", aliases: [], description: "Find song lyrics", category: "ai" },
  { command: "sr", aliases: ["reactstatus"], description: "React to a status", category: "social" },
  { command: "public", aliases: [], description: "Enable public command mode", category: "moderation", ownerOnly: true },
  { command: "private", aliases: [], description: "Restrict commands to the owner", category: "moderation", ownerOnly: true },
  { command: "online", aliases: ["alwaysonline"], description: "Toggle always-online presence", category: "tools", ownerOnly: true },
  { command: "autotype", aliases: ["autotyping"], description: "Toggle typing indicators", category: "tools", ownerOnly: true },
]

export const COMMAND_COUNT = COMMAND_CATALOG.length + COMMAND_CATALOG.reduce((count, item) => count + item.aliases.length, 0)

export function commandHelp(prefix = "."): string {
  return COMMAND_CATALOG.map((item) => {
    const aliases = item.aliases.length ? ` (${item.aliases.map((alias) => `${prefix}${alias}`).join(", ")})` : ""
    return `${prefix}${item.command}${aliases} — ${item.description}`
  }).join("\n")
}

export function commandCatalogByCategory() {
  return COMMAND_CATALOG.reduce<Record<CommandCategory, CommandDefinition[]>>((groups, command) => {
    groups[command.category].push(command)
    return groups
  }, { core: [], media: [], ai: [], social: [], tools: [], moderation: [] })
}
