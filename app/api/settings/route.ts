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

  // Build one complete settings document. Updating `settings` and
  // `settings.*` in the same MongoDB operation causes a path conflict.
  const current = await getBots().then((collection) => collection.findOne({ number: session.number }))
  if (!current) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 })
  }
  const nextSettings = {
    ...DEFAULT_SETTINGS,
    ...(current.settings || {}),
  } as BotSettings
  for (const key of EDITABLE_SETTING_KEYS) {
    if (!(key in incoming)) continue
    const value = incoming[key]

    // Field-specific validation
    if (key === "botName") {
      if (typeof value !== "string") continue
      const trimmed = value.trim().slice(0, 40)
      if (trimmed.length === 0) continue
      nextSettings[key] = trimmed
    } else if (key === "prefix") {
      if (typeof value !== "string") continue
      const p = value.trim().slice(0, 3) || "."
      nextSettings[key] = p
    } else if (key === "viewOnceMode") {
      if (value === "same" || value === "dm") nextSettings[key] = value
    } else if (key === "statusReactEmojis") {
      // Validate emoji list: comma-separated, non-empty
      if (typeof value !== "string") continue
      const emojis = value
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
      if (emojis.length > 0) nextSettings[key] = emojis.join(",")
    } else if (key === "groupWorkWhitelist") {
      // Handle string arrays
      if (Array.isArray(value)) {
        nextSettings[key] = value.filter(v => typeof v === "string")
      } else if (value === "" || value === null) {
        nextSettings[key] = []
      }
    } else if (
      // Boolean fields
      key === "autoStatusView" ||
      key === "autoStatusReact" ||
      key === "antiViewOnce" ||
      key === "aliveEnabled" ||
      key === "pingEnabled" ||
      key === "pairCommandEnabled" ||
      key === "aiEnabled" ||
      key === "alwaysOnline" ||
      key === "autoTyping" ||
      key === "publicMode" ||
      key === "autoLikeStatus" ||
      key === "autoChatEnabled" ||
      key === "autoChatUseAI" ||
      key === "groupWorkEnabled" ||
      key === "antiSpamEnabled"
    ) {
      if (typeof value === "boolean") nextSettings[key] = value
    } else if (
      // Numeric fields
      key === "autoStatusViewDelay" ||
      key === "autoStatusReactDelay" ||
      key === "autoLikeDelay" ||
      key === "autoClearCacheHours" ||
      key === "groupWorkThreshold" ||
      key === "groupAutoUnlockMinutes" ||
      key === "antiSpamMessagesPerMinute" ||
      key === "antiSpamWarnings"
    ) {
      const num = typeof value === "number" ? value : parseInt(String(value), 10)
      if (!isNaN(num) && num >= 0) nextSettings[key] = Math.max(0, num)
    } else if (
      // String fields
      key === "aiPersona" ||
      key === "welcomeImageUrl"
    ) {
      if (typeof value === "string") nextSettings[key] = value.slice(0, 500)
    } else if (key === "antiLink") {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const policy = value as Record<string, unknown>
        nextSettings[key] = {
          enabled: policy.enabled === true,
          groupJid: typeof policy.groupJid === "string" ? policy.groupJid.trim().slice(0, 120) : "",
          warnings: {},
        }
      }
    } else if (key === "antiSpamAction") {
      // Enum validation
      if (value === "warn" || value === "kick") nextSettings[key] = value
    } else {
      // Fallback: accept boolean or string
      if (typeof value === "boolean" || typeof value === "string") (nextSettings as unknown as Record<string, unknown>)[key] = value
    }
  }

  if (!Object.keys(incoming).some((key) => EDITABLE_SETTING_KEYS.includes(key as keyof BotSettings))) {
    return NextResponse.json({ error: "No valid settings to update" }, { status: 400 })
  }
  const bots = await getBots()
  console.info("[v0] settings persistence", { number: session.number, keys: Object.keys(incoming) })
  const result = await bots.findOneAndUpdate(
    { number: session.number },
    { $set: { settings: nextSettings, updatedAt: new Date() } },
    { returnDocument: "after" },
  )

  if (!result) {
    return NextResponse.json({ error: "Bot not found" }, { status: 404 })
  }

  // Best-effort: tell the live bot to reload settings. Never block the
  // dashboard response if the engine is unreachable.
  try {
    await refreshBotSettings(session.number)
  } catch {
    return NextResponse.json({
      error: "Settings saved, but the bot engine could not refresh. Check ENGINE_URL and ENGINE_API_KEY.",
      settings: { ...DEFAULT_SETTINGS, ...result.settings },
      synced: false,
    })
  }

  return NextResponse.json({
    settings: { ...DEFAULT_SETTINGS, ...result.settings },
    synced: true,
  })
}
