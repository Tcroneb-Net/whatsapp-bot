import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { connectDb, bots, authState } from "@/engine/src/db"

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.number) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await connectDb()

    // Get bot settings
    const botDoc = await bots().findOne({ number: session.number })
    
    // Get session info
    const sessionDocs = await authState().countDocuments({ number: session.number })

    // Calculate uptime (mock data based on settings)
    const createdAt = botDoc?.createdAt ? new Date(botDoc.createdAt) : new Date()
    const uptimeMs = Date.now() - createdAt.getTime()
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60))
    const uptimeMinutes = Math.floor((uptimeMs / (1000 * 60)) % 60)

    // Real statistics
    const settings = botDoc?.settings
    const stats = {
      botStatus: botDoc?.status || "pairing",
      botName: settings?.botName || "Spider Mini",
      uptime: uptimeHours,
      uptimeFormatted: `${uptimeHours}h ${uptimeMinutes}m`,
      sessionKeys: sessionDocs,
      featureCount: Object.values(settings || {}).filter(v => v === true).length,
      
      // Performance metrics
      memory: {
        used: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.floor(process.memoryUsage().heapTotal / 1024 / 1024),
      },
      
      // Features enabled
      features: {
        autoStatusView: settings?.autoStatusView || false,
        autoStatusReact: settings?.autoStatusReact || false,
        antiViewOnce: settings?.antiViewOnce || false,
        aiEnabled: settings?.aiEnabled || false,
        autoTyping: settings?.autoTyping || false,
        alwaysOnline: settings?.alwaysOnline || false,
      },
      
      // Pro features
      proFeatures: {
        sunoMusic: true,
        imageGeneration: true,
        aiChat: true,
        mediaDownloader: true,
        groupControl: true,
        antiSpam: true,
      },
      
      // Settings
      prefix: settings?.prefix || ".",
      commandsAvailable: 50, // Total available commands
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error("[v0] Dashboard stats error:", error)
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 })
  }
}
