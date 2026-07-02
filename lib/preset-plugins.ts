export interface PresetPlugin {
  id: string
  name: string
  description: string
  command: string
  apiUrl: string
  category: "downloader" | "music" | "social"
  featured?: boolean
  icon?: string
  requiresAuth?: boolean
  parameterRequests?: string[]
}

export const PRESET_PLUGINS: PresetPlugin[] = [
  {
    id: "suno-ai-music",
    name: "Suno AI Music",
    description: "Create professional AI music with Suno. Ask for prompt, lyrics, tags, and title.",
    command: "suno",
    apiUrl: "https://apis.davidcyril.name.ng/aimusic/suno/create",
    category: "music",
    featured: true,
    icon: "Music",
    parameterRequests: ["prompt", "lyrics", "tags", "title"],
  },
  {
    id: "instagram-dl",
    name: "Instagram Downloader",
    description: "Download Instagram posts, reels, and stories",
    command: "ig",
    apiUrl: "https://apis.davidcyril.name.ng/instagram",
    category: "downloader",
    icon: "Download",
  },
  {
    id: "facebook-video-dl",
    name: "Facebook Video Downloader",
    description: "Download videos and photos from Facebook",
    command: "fb",
    apiUrl: "https://apis.davidcyril.name.ng/endpoints/download/#facebook-video",
    category: "downloader",
    icon: "Download",
  },
  {
    id: "tiktok-saver",
    name: "TikTok Saver",
    description: "Save and download TikTok videos without watermark",
    command: "tiktok",
    apiUrl: "https://apis.davidcyril.name.ng/endpoints/download/#savetik",
    category: "downloader",
    icon: "Download",
  },
  {
    id: "song-downloader",
    name: "Music/Song Downloader",
    description: "Download songs, music, and audio files in high quality",
    command: "song",
    apiUrl: "https://apis.davidcyril.name.ng/endpoints/download/#song-download",
    category: "downloader",
    icon: "Music",
  },
]

export function getPresetPluginById(id: string): PresetPlugin | undefined {
  return PRESET_PLUGINS.find((p) => p.id === id)
}

export function getPresetPluginsByCategory(category: PresetPlugin["category"]): PresetPlugin[] {
  return PRESET_PLUGINS.filter((p) => p.category === category)
}

export function getFeaturedPlugins(): PresetPlugin[] {
  return PRESET_PLUGINS.filter((p) => p.featured)
}
