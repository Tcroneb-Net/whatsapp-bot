// Thin client used by the dashboard to talk to the long-running bot engine.
// The engine runs as a separate persistent Node process (see /engine).

function getEngineConfig() {
  const url = process.env.ENGINE_URL
  const key = process.env.ENGINE_API_KEY
  
  return { url, key }
}

function ensureConfig() {
  const { url } = getEngineConfig()
  if (!url || url.trim() === "") {
    throw new Error(
      "ENGINE_URL is not configured.\n" +
      "1. Go to Project Settings > Vars\n" +
      "2. Add ENGINE_URL with your engine URL (e.g., https://your-engine.railway.app/)\n" +
      "3. Add ENGINE_API_KEY (optional, for security)\n" +
      "4. Redeploy the project\n" +
      `Current value: ${url || "not set"}`
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
  await engineFetch("/refresh", {
    method: "POST",
    body: JSON.stringify({ number }),
  })
}

export async function getBotStatus(number: string): Promise<{ status: string; connected: boolean }> {
  return engineFetch(`/status?number=${encodeURIComponent(number)}`) as Promise<{
    status: string
    connected: boolean
  }>
}
