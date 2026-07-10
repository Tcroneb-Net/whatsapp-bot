import { type NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { requestPairingCode } from "@/lib/engine"
import { normalizeNumber } from "@/lib/phone"
import { generatePassword } from "@/lib/password"
import { getBots } from "@/lib/mongodb"
import { DEFAULT_SETTINGS } from "@/lib/types"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const number = normalizeNumber(body?.number || "")
    if (!number) {
      return NextResponse.json(
        { error: "Please enter a valid phone number with country code." },
        { status: 400 },
      )
    }

    // Generate a fresh dashboard password for this pairing attempt and store
    // only its hash. The plaintext is shown once here and DM'd by the bot.
    const password = generatePassword()
    const passwordHash = await bcrypt.hash(password, 10)

    const bots = await getBots()
    const now = new Date()
    await bots.updateOne(
      { number },
      {
        $set: { passwordHash, status: "pairing", updatedAt: now },
        $setOnInsert: {
          number,
          settings: DEFAULT_SETTINGS,
          createdAt: now,
        },
      },
      { upsert: true },
    )

    // Ask the engine for a pairing code and hand it the plaintext password so
    // it can DM the user once they connect.
    let code: string
    try {
      const result = await requestPairingCode(number, password)
      code = result.code
    } catch (engineErr) {
      console.error("[v0] Engine pairing error:", engineErr)
      // Check if it's a connection error
      if (engineErr instanceof Error && (engineErr.message.includes("404") || engineErr.message.includes("Engine request failed"))) {
        return NextResponse.json(
          { 
            error: "Bot engine is not running. Make sure ENGINE_URL and ENGINE_API_KEY are configured in Project Settings > Vars.",
            hint: "Engine server must be running separately to handle pairing."
          },
          { status: 503 }
        )
      }
      throw engineErr
    }

    return NextResponse.json({ code, number, password })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to request pairing code."
    console.error("[v0] Pair endpoint error:", message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
