import { NextRequest, NextResponse } from "next/server"

interface ImageResponse {
  statusCode: number
  success: boolean
  creator?: string
  model?: string
  prompt: string
  image: string
  timestamp: string
  attribution: string
}

interface LuminuxResponse {
  platform: string
  model: string
  model_name: string
  endpoint: string
  lxquery: string
  timestamp: string
  image_url: string
  image_mime: string
  image_size: number
  watermarked: boolean
  status: boolean
  status_code: number
  revised_prompt: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { prompt, useLuminux } = body

    if (!prompt) {
      return NextResponse.json(
        { error: "Missing required field: prompt" },
        { status: 400 }
      )
    }

    if (useLuminux) {
      // Use Luminux for best quality
      const luminuxUrl = process.env.LUMINUX_API_URL
      if (!luminuxUrl) {
        return NextResponse.json(
          { error: "LUMINUX_API_URL not configured" },
          { status: 500 }
        )
      }

      const params = new URLSearchParams({
        model: "lumi-xgold",
        prompt: prompt,
      })

      const response = await fetch(`${luminuxUrl}?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`Luminux API error: ${response.status}`)
      }

      const data: LuminuxResponse = await response.json()
      return NextResponse.json({
        statusCode: data.status_code,
        success: data.status,
        platform: data.platform,
        model: data.model_name,
        prompt: data.revised_prompt,
        image: data.image_url,
        timestamp: data.timestamp,
        attribution: "Luminux XD",
      })
    } else {
      // Use Omegatech Nano Banana Pro
      const imageApiUrl = process.env.IMAGE_AI_API_URL
      if (!imageApiUrl) {
        return NextResponse.json(
          { error: "IMAGE_AI_API_URL not configured" },
          { status: 500 }
        )
      }

      const params = new URLSearchParams({
        prompt: prompt,
      })

      const response = await fetch(`${imageApiUrl}?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`Image API error: ${response.status}`)
      }

      const data: ImageResponse = await response.json()
      return NextResponse.json(data)
    }
  } catch (error) {
    console.error("[v0] Image generation error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate image" },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const prompt = searchParams.get("prompt")
    const useLuminux = searchParams.get("luminux") === "true"

    if (!prompt) {
      return NextResponse.json(
        { error: "Missing required parameter: prompt" },
        { status: 400 }
      )
    }

    if (useLuminux) {
      const luminuxUrl = process.env.LUMINUX_API_URL
      if (!luminuxUrl) {
        return NextResponse.json(
          { error: "LUMINUX_API_URL not configured" },
          { status: 500 }
        )
      }

      const params = new URLSearchParams({
        model: "lumi-xgold",
        prompt: prompt,
      })

      const response = await fetch(`${luminuxUrl}?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`Luminux API error: ${response.status}`)
      }

      const data: LuminuxResponse = await response.json()
      return NextResponse.json({
        statusCode: data.status_code,
        success: data.status,
        platform: data.platform,
        model: data.model_name,
        prompt: data.revised_prompt,
        image: data.image_url,
        timestamp: data.timestamp,
        attribution: "Luminux XD",
      })
    } else {
      const imageApiUrl = process.env.IMAGE_AI_API_URL
      if (!imageApiUrl) {
        return NextResponse.json(
          { error: "IMAGE_AI_API_URL not configured" },
          { status: 500 }
        )
      }

      const params = new URLSearchParams({
        prompt: prompt,
      })

      const response = await fetch(`${imageApiUrl}?${params.toString()}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error(`Image API error: ${response.status}`)
      }

      const data: ImageResponse = await response.json()
      return NextResponse.json(data)
    }
  } catch (error) {
    console.error("[v0] Image generation error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate image" },
      { status: 500 }
    )
  }
}
