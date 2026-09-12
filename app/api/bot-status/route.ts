import { NextResponse } from "next/server"
import { getBots } from "@/lib/mongodb"
import { getSession } from "@/lib/auth"
import { requestBotStatus, refreshBotSettings, requestEngineHealth, requestEngineReadiness } from "@/lib/engine"
import { DEFAULT_SETTINGS } from "@/lib/types"

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const bots = await getBots()
  const bot = await bots.findOne({ number: session.number })
  if (!bot) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 })
  }

  // Get dashboard settings (merged with defaults)
  const dashboardSettings = {
    ...DEFAULT_SETTINGS,
    ...bot.settings,
    antiLink: { ...DEFAULT_SETTINGS.antiLink, ...(bot.settings?.antiLink || {}) },
  }

  // Try to get live engine status
  let engineStatus: Record<string, unknown> | null = null
  let engineHealth: Record<string, unknown> | null = null
  let engineReadiness: Record<string, unknown> | null = null
  let engineError: string | null = null
  try {
    ;[engineHealth, engineReadiness] = await Promise.all([
      requestEngineHealth(),
      requestEngineReadiness(),
    ])
  } catch (err) {
    engineError = err instanceof Error ? err.message : String(err)
  }
  try {
    engineStatus = await requestBotStatus(session.number)
  } catch (err) {
    engineError = err instanceof Error ? err.message : String(err)
    console.warn("[v0] Failed to get engine status:", engineError)
  }

  const normalizeSetting = (key: string, value: unknown): unknown => {
    if (value === undefined || value === null) return dashboardSettings[key as keyof typeof dashboardSettings]
    if (["autoStatusView", "autoStatusReact", "antiViewOnce", "aliveEnabled", "pingEnabled", "pairCommandEnabled", "aiEnabled", "alwaysOnline", "autoTyping", "publicMode", "autoLikeStatus", "autoChatEnabled", "autoChatUseAI", "groupWorkEnabled", "antiSpamEnabled"].includes(key)) return value === true || value === "true"
    if (key === "viewOnceMode") return value === "same" || value === "dm" ? value : dashboardSettings.viewOnceMode
    if (key === "prefix") return String(value).trim() || dashboardSettings.prefix
    return value
  }

  const settingsMatch = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    Object.keys(dashboardSettings).every((key) => JSON.stringify(normalizeSetting(key, a[key])) === JSON.stringify(normalizeSetting(key, b[key])))

  // Compare settings after forcing the live session to reload Mongo state.
  if (engineStatus?.settings) {
    const liveSettings = engineStatus.settings as Record<string, unknown>
    const stale = !settingsMatch(dashboardSettings, liveSettings)
    if (stale) {
      try {
        console.info("[v0] status detected stale engine settings; refreshing", { number: session.number })
        await refreshBotSettings(session.number)
        engineStatus = await requestBotStatus(session.number)
      } catch (err) {
        console.warn("[v0] automatic engine settings refresh failed", {
          number: session.number,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  const sync = {
    isDashboardInSync: true,
    differences: [] as Array<{ key: string; dashboard: unknown; engine: unknown }>,
  }

  if (engineStatus?.settings) {
    const engineSettings = engineStatus.settings as Record<string, unknown>
    for (const key of Object.keys(dashboardSettings)) {
      const dashValue = dashboardSettings[key as keyof typeof dashboardSettings]
      const engValue = engineSettings[key]
      if (JSON.stringify(normalizeSetting(key, dashValue)) !== JSON.stringify(normalizeSetting(key, engValue))) {
        sync.isDashboardInSync = false
        sync.differences.push({
          key,
          dashboard: dashValue,
          engine: engValue,
        })
      }
    }
  }

  return NextResponse.json({
    number: bot.number,
    status: engineStatus?.connected === true
      ? "connected"
      : engineStatus?.hasCredentials === true
        ? "restoring"
        : engineHealth || engineReadiness
          ? "pairing"
          : "disconnected",
    connected: engineStatus?.connected === true,
    engineReachable: engineHealth !== null || engineReadiness !== null || engineStatus !== null,
    engineError,
    engineHealth,
    engineReadiness,
    dashboardSettings,
    engineStatus: engineStatus ?? null,
    sync,
  })
}
