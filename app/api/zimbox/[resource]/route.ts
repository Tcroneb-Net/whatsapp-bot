import { NextRequest, NextResponse } from "next/server"

const BASE_URL = "https://zimbox-api.top.co.zw/api/dramabox"
const ALLOWED_RESOURCES = new Set(["home", "detail", "search", "category", "stream"])

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ resource: string }> },
) {
  const { resource } = await context.params
  if (!ALLOWED_RESOURCES.has(resource)) {
    return NextResponse.json({ error: "Unsupported DramaBox resource" }, { status: 404 })
  }

  const upstream = new URL(`${BASE_URL}/${resource}`)
  request.nextUrl.searchParams.forEach((value, key) => upstream.searchParams.set(key, value))

  try {
    const response = await fetch(upstream, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    })
    const body = await response.text()
    return new NextResponse(body, {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    })
  } catch {
    return NextResponse.json({ error: "DramaBox service unavailable" }, { status: 502 })
  }
}
