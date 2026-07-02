import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getBots } from "@/lib/mongodb"
import { nanoid } from "nanoid"
import type { Plugin } from "@/lib/types"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.number) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const bots = await getBots()
    const bot = await bots.findOne({ number: session.number })
    if (!bot) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 })
    }

    const plugins = (bot.plugins ?? []) as Plugin[]
    return NextResponse.json({ plugins })
  } catch (err) {
    console.error("GET /api/plugins error:", err)
    return NextResponse.json({ error: "Failed to fetch plugins" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.number) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, apiUrl, command } = body as Partial<Plugin>

    if (!name || !apiUrl || !command) {
      return NextResponse.json(
        { error: "Missing required fields: name, apiUrl, command" },
        { status: 400 },
      )
    }

    const plugin: Plugin = {
      id: nanoid(),
      name,
      description: description || "",
      apiUrl,
      command: command.startsWith(".") ? command : `.${command}`,
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const bots = await getBots()
    await bots.updateOne(
      { number: session.number },
      {
        $push: { plugins: plugin },
        $set: { updatedAt: new Date() },
      },
    )

    return NextResponse.json({ plugin }, { status: 201 })
  } catch (err) {
    console.error("POST /api/plugins error:", err)
    return NextResponse.json({ error: "Failed to create plugin" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.number) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { id, enabled, name, description } = body

    if (!id) {
      return NextResponse.json({ error: "Missing plugin id" }, { status: 400 })
    }

    const update: any = { updatedAt: new Date() }
    if (enabled !== undefined) update["plugins.$.enabled"] = enabled
    if (name !== undefined) update["plugins.$.name"] = name
    if (description !== undefined) update["plugins.$.description"] = description

    const bots = await getBots()
    const result = await bots.updateOne(
      { number: session.number, "plugins.id": id },
      { $set: update },
    )

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Plugin not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("PATCH /api/plugins error:", err)
    return NextResponse.json({ error: "Failed to update plugin" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.number) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Missing plugin id" }, { status: 400 })
    }

    const bots = await getBots()
    await bots.updateOne(
      { number: session.number },
      {
        $pull: { plugins: { id } },
        $set: { updatedAt: new Date() },
      },
    )

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("DELETE /api/plugins error:", err)
    return NextResponse.json({ error: "Failed to delete plugin" }, { status: 500 })
  }
}
