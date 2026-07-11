import { NextRequest, NextResponse } from "next/server"

interface SunoRequest {
  prompt: string
  title: string
  tags: string
}

interface Track {
  title: string
  imageUrl: string
  audioUrl: string
  videoUrl?: string
  modelVersion: string
}

interface SunoResponse {
  statusCode: number
  success: boolean
  source: string
  data: {
    prompt: string
    title: string
    tags: string
    tracks: Track[]
  }
  timestamp: string
  attribution: string
}

export async function POST(req: NextRequest) {
  try {
    const body: SunoRequest = await req.json()
    const { prompt, title, tags } = body

    if (!prompt || !title) {
      return NextResponse.json(
        { error: "Missing required fields: prompt and title" },
        { status: 400 }
      )
    }

    const sunoUrl = process.env.SUNO_API_URL
    if (!sunoUrl) {
      return NextResponse.json(
        { error: "SUNO_API_URL not configured" },
        { status: 500 }
      )
    }

    const params = new URLSearchParams({
      action: "generate",
      prompt: prompt,
      title: title,
      tags: tags || "AI Generated",
    })

    const response = await fetch(`${sunoUrl}?${params.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`Suno API error: ${response.status}`)
    }

    const data: SunoResponse = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Suno API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate music" },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const prompt = searchParams.get("prompt")
    const title = searchParams.get("title")
    const tags = searchParams.get("tags") || "AI Generated"

    if (!prompt || !title) {
      return NextResponse.json(
        { error: "Missing required parameters: prompt and title" },
        { status: 400 }
      )
    }

    const sunoUrl = process.env.SUNO_API_URL
    if (!sunoUrl) {
      return NextResponse.json(
        { error: "SUNO_API_URL not configured" },
        { status: 500 }
      )
    }

    const params = new URLSearchParams({
      action: "generate",
      prompt: prompt,
      title: title,
      tags: tags,
    })

    const response = await fetch(`${sunoUrl}?${params.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })

    if (!response.ok) {
      throw new Error(`Suno API error: ${response.status}`)
    }

    const data: SunoResponse = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Suno API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate music" },
      { status: 500 }
    )
  }
}
