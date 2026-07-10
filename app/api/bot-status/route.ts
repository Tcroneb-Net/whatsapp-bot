import { NextResponse } from "next/server"
import { getBots } from "@/lib/mongodb"
import { getSession } from "@/lib/auth"
import { requestBotStatus } from "@/lib/engine"
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
  const dashboardSettings = { ...DEFAULT_SETTINGS, ...bot.settings }

  // Try to get live engine status
  let engineStatus: Record<string, unknown> | null = null
  try {
    engineStatus = await requestBotStatus(session.number)
  } catch (err) {
    console.log("[v0] Failed to get engine status:", err instanceof Error ? err.message : String(err))
  }

  // Compare settings
  const sync = {
    isDashboardInSync: true,
    differences: [] as Array<{ key: string; dashboard: unknown; engine: unknown }>,
  }

  if (engineStatus?.settings) {
    const engineSettings = engineStatus.settings as Record<string, unknown>
    for (const key of Object.keys(dashboardSettings)) {
      const dashValue = dashboardSettings[key as keyof typeof dashboardSettings]
      const engValue = engineSettings[key]
      if (JSON.stringify(dashValue) !== JSON.stringify(engValue)) {
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
    status: bot.status,
    connected: engineStatus?.connected ?? false,
    dashboardSettings,
    engineStatus: engineStatus?.settings ?? null,
    sync,
  })
}
