import { config } from "./config.js"
import { logger } from "./logger.js"

// Thin client for the Hostify API that powers AI, search and download
// commands. Responses are normalized defensively because upstream shapes vary.

const BASE = config.hostifyApi.replace(/\/$/, "")

async function getJson(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { method: "GET" })
  return res.json()
}

async function postJson(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.json()
}

// Pull the first string that looks like a media URL out of an arbitrary shape.
export function findUrl(obj: any, hint?: RegExp): string | null {
  const seen = new Set<any>()
  const stack = [obj]
  let firstAny: string | null = null
  while (stack.length) {
    const cur = stack.pop()
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue
    seen.add(cur)
    for (const [key, val] of Object.entries(cur)) {
      if (typeof val === "string" && /^https?:\/\//i.test(val)) {
        if (hint && hint.test(key)) return val
        if (!firstAny) firstAny = val
      } else if (val && typeof val === "object") {
        stack.push(val)
      }
    }
  }
  return firstAny
}

export const hostify = {
  async ai(message: string): Promise<string> {
    // letmegpt is unreliable upstream; gemini takes `prompt` and returns
    // { success, result: { answer } }.
    const data = await postJson("/api/ai/gemini", { prompt: message })
    // The API nests the reply under `result` (e.g. { result: { answer } }).
    return (
      data?.result?.answer ||
      data?.result?.response ||
      data?.result?.text ||
      (typeof data?.result === "string" ? data.result : "") ||
      data?.answer ||
      data?.response ||
      data?.message ||
      (typeof data === "string" ? data : "")
    )
  },

  async translate(text: string, to: string): Promise<string> {
    const data = await postJson("/api/ai/translapp", {
      text,
      module: "TRANSLATE",
      to,
    })
    // The API returns { result: { output } }.
    return (
      data?.result?.output ||
      data?.result?.translated ||
      data?.result?.text ||
      (typeof data?.result === "string" ? data.result : "") ||
      data?.translated ||
      data?.translation ||
      (typeof data === "string" ? data : "")
    )
  },

  async lyrics(q: string): Promise<{ title?: string; lyrics: string }> {
    const data = await getJson(`/api/Search/searchthatsong?action=search&query=${encodeURIComponent(q)}`)
    const r = data?.data ?? data?.result ?? data
    const lyrics =
      r?.lyrics || r?.lyric || r?.relevantChunk || (typeof r === "string" ? r : "") || data?.lyrics || ""
    const title = r?.song || r?.title || data?.title
    return { title, lyrics: typeof lyrics === "string" ? lyrics : JSON.stringify(lyrics) }
  },

  async youtubeSearch(q: string): Promise<any[]> {
    const data = await getJson(`/api/search/youtube?q=${encodeURIComponent(q)}`)
    const list = data?.result || data?.results || data?.data || data?.videos || data
    return Array.isArray(list) ? list : []
  },

  async pinterest(q: string): Promise<string[]> {
    const data = await getJson(`/api/search/pinterest?q=${encodeURIComponent(q)}`)
    const list = data?.result || data?.results || data?.data || data?.images || data
    if (!Array.isArray(list)) return []
    return list
      .map((item: any) =>
        typeof item === "string" ? item : item?.url || item?.image || findUrl(item),
      )
      .filter((u: any): u is string => typeof u === "string")
  },

  async soundcloud(q: string): Promise<{ title?: string; url: string | null }> {
    const data = await getJson(`/api/play/soundcloud?q=${encodeURIComponent(q)}`)
    return { title: data?.title || data?.result?.title, url: findUrl(data, /audio|mp3|url|link/i) }
  },

  async ytmp3(url: string): Promise<{ title?: string; url: string | null }> {
    const data = await postJson("/api/downloader/ytmp3", { url })
    return { title: data?.title || data?.result?.title, url: findUrl(data, /audio|mp3|url|link|download/i) }
  },

  async youtube(url: string): Promise<{ title?: string; url: string | null }> {
    const data = await postJson("/api/downloader/youtube", { url })
    return { title: data?.title || data?.result?.title, url: findUrl(data, /video|mp4|url|link|download/i) }
  },

  async dubbing(url: string, voice: string, prompt: string): Promise<{ url: string | null }> {
    const data = await postJson("/api/tools/dubbing", { url, voice, prompt })
    return { url: findUrl(data, /video|mp4|audio|url|link|download/i) }
  },
}

export async function safeHostify<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (err) {
    logger.error({ err }, "hostify request failed")
    return null
  }
}
