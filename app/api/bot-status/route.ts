import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getBots } from "@/lib/mongodb"
import { requestBotStatus, requestEngineHealth } from "@/lib/engine"

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const bots = await getBots()
  const [bot, used] = await Promise.all([bots.findOne({ number: session.number }), bots.countDocuments({})])
  if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 })
  let engineStatus: Record<string, unknown> | null = null
  let engineReachable = false
  try { engineStatus = await requestBotStatus(session.number); engineReachable = true } catch { try { await requestEngineHealth(); engineReachable = true } catch {} }
  return NextResponse.json({ number: bot.number, connected: engineStatus?.connected === true, engineReachable, capacity: { used: Math.min(used, 100), max: 100, remaining: Math.max(100 - used, 0) } })
}
