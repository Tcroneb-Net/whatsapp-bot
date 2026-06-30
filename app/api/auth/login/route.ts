import { type NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { getBots } from "@/lib/mongodb"
import { createSession } from "@/lib/auth"
import { normalizeNumber } from "@/lib/phone"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const number = normalizeNumber(body?.number || "")
    const password = typeof body?.password === "string" ? body.password : ""

    if (!number || !password) {
      return NextResponse.json({ error: "Number and password are required." }, { status: 400 })
    }

    const bots = await getBots()
    const bot = await bots.findOne({ number })
    if (!bot) {
      return NextResponse.json({ error: "No bot found for this number. Pair your number first." }, { status: 404 })
    }

    const valid = await bcrypt.compare(password, bot.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: "Invalid password." }, { status: 401 })
    }

    await createSession(number)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
