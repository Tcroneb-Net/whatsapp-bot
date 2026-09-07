import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { commandCatalogByCategory, COMMAND_COUNT } from "@/lib/command-catalog"

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  return NextResponse.json({
    count: COMMAND_COUNT,
    categories: commandCatalogByCategory(),
    generatedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "private, max-age=30" } })
}
