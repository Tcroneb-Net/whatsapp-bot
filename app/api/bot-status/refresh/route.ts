import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { refreshBotSettings } from "@/lib/engine"

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    await refreshBotSettings(session.number)
    return NextResponse.json({ ok: true, number: session.number })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Engine sync failed" }, { status: 502 })
  }
}
