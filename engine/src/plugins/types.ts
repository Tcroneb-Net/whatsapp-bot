type WASocket = any

export type PluginContext = {
  sock: WASocket
  remoteJid: string
  args: string
  reply: (text: string) => Promise<unknown>
}

export type BotPlugin = {
  name: string
  aliases: string[]
  description: string
  run: (context: PluginContext) => Promise<void>
}

export function definePlugin(plugin: BotPlugin): BotPlugin {
  return plugin
}

export function createPluginIndex(plugins: BotPlugin[]): Map<string, BotPlugin> {
  const index = new Map<string, BotPlugin>()
  for (const plugin of plugins) {
    for (const alias of [plugin.name, ...plugin.aliases]) index.set(alias.toLowerCase(), plugin)
  }
  return index
}
