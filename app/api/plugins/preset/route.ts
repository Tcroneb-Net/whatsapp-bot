import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getBots } from "@/lib/mongodb"
import { nanoid } from "nanoid"
import { PRESET_PLUGINS, getFeaturedPlugins } from "@/lib/preset-plugins"

export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get("category")
    const featured = request.nextUrl.searchParams.get("featured") === "true"

    let plugins = PRESET_PLUGINS

    if (featured) {
      plugins = getFeaturedPlugins()
    } else if (category) {
      plugins = plugins.filter((p) => p.category === category)
    }

    return NextResponse.json({ plugins })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.number) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { presetId } = await request.json()
    const preset = PRESET_PLUGINS.find((p) => p.id === presetId)

    if (!preset) {
      return NextResponse.json({ error: "Preset plugin not found" }, { status: 404 })
    }

    const botsCollection = await getBots()
    const bot = await botsCollection.findOne({ number: session.number })

    if (!bot) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 })
    }

    // Create plugin from preset
    const newPlugin = {
      id: nanoid(),
      name: preset.name,
      description: preset.description,
      command: preset.command,
      apiUrl: preset.apiUrl,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Check if command already exists
    const existingPlugin = (bot.plugins || []).find((p: any) => p.command === preset.command)
    if (existingPlugin) {
      return NextResponse.json({ error: "Plugin with this command already exists" }, { status: 400 })
    }

    // Add plugin to bot
    const updatedPlugins = [...(bot.plugins || []), newPlugin]
    await botsCollection.updateOne({ number: session.number }, { $set: { plugins: updatedPlugins } })

    return NextResponse.json({ plugin: newPlugin, success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
