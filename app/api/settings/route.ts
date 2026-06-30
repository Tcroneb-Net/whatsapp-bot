import { NextResponse } from "next/server"
import { getBots } from "@/lib/mongodb"
import { getSession } from "@/lib/auth"
import { refreshBotSettings } from "@/lib/engine"
import { DEFAULT_SETTINGS, EDITABLE_SETTING_KEYS, type BotSettings } from "@/lib/types"

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

  return NextResponse.json({
    number: bot.number,
    status: bot.status,
    lastSeen: bot.lastSeen ?? null,
    settings: { ...DEFAULT_SETTINGS, ...bot.settings },
  })
}

export async function PATCH(req: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const incoming = body?.settings as Partial<BotSettings> | undefined
  if (!incoming || typeof incoming !== "object") {
    return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 })
  }

  // Whitelist + validate each editable field.
  const update: Record<string, unknown> = {}
  for (const key of EDITABLE_SETTING_KEYS) {
    if (!(key in incoming)) continue
    const value = incoming[key]
    if (key === "botName") {
      if (typeof value !== "string") continue
      const trimmed = value.trim().slice(0, 40)
      if (trimmed.length === 0) continue
      update["settings.botName"] = trimmed
    } else if (key === "prefix") {
      if (typeof value !== "string") continue
      const p = value.trim().slice(0, 3) || "."
      update["settings.prefix"] = p
    } else if (key === "viewOnceMode") {
      if (value === "same" || value === "dm") update["settings.viewOnceMode"] = value
    } else {
      // boolean toggles
      if (typeof value === "boolean") update[`settings.${key}`] = value
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid settings to update" }, { status: 400 })
  }
  update.updatedAt = new Date()

  const bots = await getBots()
  const result = await bots.findOneAndUpdate(
    { number: session.number },
    { $set: update },
    { returnDocument: "after" },
  )

  if (!result) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 })
  }

  // Best-effort: tell the live bot to reload settings. Never block the
  // dashboard response if the engine is unreachable.
  refreshBotSettings(session.number).catch(() => {})

  return NextResponse.json({
    settings: { ...DEFAULT_SETTINGS, ...result.settings },
  })
}
