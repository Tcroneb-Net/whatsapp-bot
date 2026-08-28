import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { connectDb, bots } from "@/engine/src/db"
import { DEFAULT_SETTINGS } from "@/lib/types"

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.number) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await connectDb()
    const botDoc = await bots().findOne({ number: session.number })
    const settings = botDoc?.settings

    const proFeatures = {
      music: {
        name: "Suno v4 Pro Music",
        enabled: true,
        description: "Generate AI-powered battle anthems and music tracks",
        commands: [".suno <prompt>", ".music <prompt>"],
        status: "active" as const,
      },
      imageGeneration: {
        name: "Dual Image AI",
        enabled: true,
        description: "Luminux XGold & Nano Banana Pro for stunning visuals",
        commands: [".img <prompt>", ".img <prompt> --luminux"],
        status: "active" as const,
      },
      aiChat: {
        name: "AI Oracle & Wisdom",
        enabled: settings?.aiEnabled || false,
        description: "GPT, Gemini, Claude, and advanced AI responses",
        commands: [".ai <text>", ".gpt <text>", ".gemini <text>", ".claude <text>"],
        status: "active" as const,
      },
      mediaDownload: {
        name: "Trophy Chamber",
        enabled: true,
        description: "Download from all social platforms",
        commands: [".play", ".download", ".spotify", ".sc", ".fb"],
        status: "active" as const,
      },
      groupControl: {
        name: "Arena Management",
        enabled: true,
        description: "Full warrior/group management dashboard",
        commands: ["Dashboard access"],
        status: "active" as const,
      },
      antiSpam: {
        name: "Spectator Shield",
        enabled: settings?.antiSpamEnabled || false,
        description: "Anti-spam, message counting, auto-lock",
        commands: ["Automatic protection"],
        status: "active" as const,
      },
      smartPresence: {
        name: "Smart Online Status",
        enabled: !settings?.alwaysOnline,
        description: "Online when active, offline when idle",
        commands: [".online on/off"],
        status: "active" as const,
      },
      voiceDub: {
        name: "Voice Transformation",
        enabled: true,
        description: "AI voice dubbing for videos",
        commands: [".dub <url>"],
        status: "active" as const,
      },
    }

    return NextResponse.json(proFeatures)
  } catch (error) {
    console.error("[v0] Pro features error:", error)
    return NextResponse.json({ error: "Failed to fetch pro features" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.number) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { feature, enabled } = await req.json()
    await connectDb()

    const bot = await bots().findOne({ number: session.number })
    if (!bot) return NextResponse.json({ error: "Bot not found" }, { status: 404 })
    const settings = { ...DEFAULT_SETTINGS, ...(bot.settings || {}) } as typeof DEFAULT_SETTINGS
    const allowed = new Set(["alive", "ping", "pairCommand", "ai", "autoChat"])
    if (!allowed.has(feature) || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "Invalid feature" }, { status: 400 })
    }
    ;(settings as unknown as Record<string, unknown>)[`${feature}Enabled`] = enabled
    await bots().updateOne(
      { number: session.number },
      { $set: { settings, updatedAt: new Date() } },
    )

    return NextResponse.json({ success: true, message: `${feature} ${enabled ? "enabled" : "disabled"}` })
  } catch (error) {
    console.error("[v0] Pro features update error:", error)
    return NextResponse.json({ error: "Failed to update feature" }, { status: 500 })
  }
}
