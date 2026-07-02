import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { connectDb, viewOnceLogs } from "@/engine/src/db"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.number) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await connectDb()
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "50"), 500)
    const skip = parseInt(request.nextUrl.searchParams.get("skip") || "0")

    const logs = await viewOnceLogs()
      .find({ number: session.number })
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip)
      .toArray()

    const total = await viewOnceLogs().countDocuments({ number: session.number })

    return NextResponse.json({ logs, total, limit, skip })
  } catch (error) {
    console.error("[logs] error:", error)
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 })
  }
}
