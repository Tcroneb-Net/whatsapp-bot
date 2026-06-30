import { NextResponse } from "next/server"
import { getBots } from "@/lib/mongodb"
import { getSession, destroySession } from "@/lib/auth"
import { deleteBotSession } from "@/lib/engine"

// Deletes the WhatsApp session for the logged-in user: tells the engine to log
// out + drop credentials, removes the bot document, and clears the dashboard session.
export async function DELETE() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await deleteBotSession(session.number)
  } catch (err) {
    // Even if the engine is unreachable, continue removing the DB record so the
    // user is not stuck. The engine will reconcile on next boot.
    console.warn("[v0] engine session delete failed:", err instanceof Error ? err.message : err)
  }

  const bots = await getBots()
  await bots.deleteOne({ number: session.number })
  await destroySession()

  return NextResponse.json({ ok: true })
}
