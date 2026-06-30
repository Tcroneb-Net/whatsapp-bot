import { type NextRequest, NextResponse } from "next/server"
import { requestPairingCode } from "@/lib/engine"
import { normalizeNumber } from "@/lib/phone"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const number = normalizeNumber(body?.number || "")
    if (!number) {
      return NextResponse.json({ error: "Please enter a valid phone number with country code." }, { status: 400 })
    }

    const { code } = await requestPairingCode(number)
    return NextResponse.json({ code, number })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to request pairing code."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
