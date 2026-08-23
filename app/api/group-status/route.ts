import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getBots } from "@/lib/mongodb"
import { broadcastGroupStatusImage } from "@/lib/engine"

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.number) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : ""
  const caption = typeof body?.caption === "string" ? body.caption.slice(0, 1024) : ""
  if (!imageBase64) return NextResponse.json({ error: "Choose an image first." }, { status: 400 })
  const raw = imageBase64.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "")
  if (!raw || Buffer.byteLength(raw, "base64") > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Image must be 8MB or smaller." }, { status: 413 })
  }

  const bots = await getBots()
  const bot = await bots.findOne({ number: session.number })
  if (!bot) return NextResponse.json({ error: "Bot session not found." }, { status: 404 })

  try {
    const result = await broadcastGroupStatusImage(session.number, raw, caption)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Broadcast failed." }, { status: 502 })
  }
}
