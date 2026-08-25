// Thin client used by the dashboard to talk to the long-running bot engine.
// The engine runs as a separate persistent Node process (see /engine).

import pino from "pino"

const logger = pino()

function normalizeEngineUrl(url: string): string {
  // Ensure URL has protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`
  }
  // Ensure no trailing slash
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function getEngineConfig() {
  // Use process.env only - this ensures Vercel environment variables are used
  let url = process.env.ENGINE_URL?.trim()
  const key = process.env.ENGINE_API_KEY?.trim()
  
  // Normalize URL to ensure it has proper protocol
  if (url) {
    url = normalizeEngineUrl(url)
  }
  
  return { url, key }
}

function ensureConfig() {
  const { url } = getEngineConfig()
  if (!url) {
    const isDev = process.env.NODE_ENV === 'development'
    throw new Error(
      isDev 
        ? `ENGINE_URL is not configured for development.\nAdd to .env.development.local: ENGINE_URL=https://whatsbot.hostify.co.zw`
        : `ENGINE_URL is not configured on Vercel.\n` +
          `1. Go to https://vercel.com/tcronebhackx-md/whatsapp-bot/settings/environment-variables\n` +
          `2. Add ENGINE_URL for your engine deployment\n` +
          `3. Add ENGINE_API_KEY matching the engine secret\n` +
          `4. Redeploy the project\n` +
          `5. Make sure to set it for both Production and Preview environments`
    )
  }
}

async function engineFetch(path: string, init?: RequestInit) {
  ensureConfig()
  const { url, key } = getEngineConfig()
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key || "",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  })
  
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { error: text }
  }
  if (!res.ok) {
    const message = (data as { error?: string })?.error || `Engine request failed (${res.status})`
    throw new Error(message)
  }
  return data
}

export async function requestPairingCode(
  number: string,
  password?: string,
): Promise<{ code: string }> {
  return engineFetch("/pair", {
    method: "POST",
    // The plaintext password is passed so the engine can DM it once on a
    // successful connection. It is never persisted by the engine.
    body: JSON.stringify({ number, password }),
  }) as Promise<{ code: string }>
}

export async function deleteBotSession(number: string): Promise<void> {
  await engineFetch("/session", {
    method: "DELETE",
    body: JSON.stringify({ number }),
  })
}

export async function refreshBotSettings(number: string): Promise<void> {
  try {
    await engineFetch(`/session/${number}/refresh-settings`, {
      method: "POST",
    })
  } catch (err) {
    logger.error({ err, number }, "failed to refresh bot settings on engine")
    throw err
  }
}

export async function requestBotStatus(number: string): Promise<Record<string, unknown>> {
  ensureConfig()
  const { url, key } = getEngineConfig()
  try {
    const res = await fetch(`${url}/session/${number}/status`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key || "",
      },
    })
    if (!res.ok) {
      throw new Error(`Status request failed: ${res.status}`)
    }
    return res.json()
  } catch (err) {
    logger.error({ err, number }, "failed to get bot status from engine")
    throw err
  }
}

export async function getBotStatus(number: string): Promise<{ status: string; connected: boolean }> {
  return engineFetch(`/status?number=${encodeURIComponent(number)}`) as Promise<{
    status: string
    connected: boolean
  }>
}

export async function broadcastGroupStatusImage(
  number: string,
  imageBase64: string,
  caption = "",
): Promise<{ sent: number; failed: number }> {
  return engineFetch("/broadcast/group-status", {
    method: "POST",
    body: JSON.stringify({ number, imageBase64, caption }),
  }) as Promise<{ sent: number; failed: number }>
}
