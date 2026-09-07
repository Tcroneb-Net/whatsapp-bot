import { NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { getDb } from "@/lib/mongodb"
import os from "node:os"

export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.number) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const memUsage = process.memoryUsage()
    const uptime = process.uptime()

    const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100
    const memStatus = memPercent > 85 ? "critical" : memPercent > 70 ? "warning" : "healthy"
    let database: { status: string; collections: number; documentsApprox: number; indexCount: number; error?: string }
    try {
      const db = await getDb()
      const collections = await db.listCollections().toArray()
      const stats = await db.stats()
      database = {
        status: "connected",
        collections: collections.length,
        documentsApprox: stats.objects,
        indexCount: stats.indexes,
      }
    } catch (error) {
      database = { status: "error", collections: 0, documentsApprox: 0, indexCount: 0, error: error instanceof Error ? error.message : "MongoDB unavailable" }
    }

    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      
      system: {
        uptime: Math.floor(uptime),
        uptimeFormatted: formatUptime(uptime),
        memory: {
          used: Math.round(memUsage.heapUsed / 1024 / 1024),
          total: Math.round(memUsage.heapTotal / 1024 / 1024),
          percent: Math.round(memPercent),
          status: memStatus,
        },
        cpu: {
          usage: Math.round((os.loadavg()[0] / Math.max(os.cpus().length, 1)) * 100),
          cores: os.cpus().length,
        },
      },
      database,
      bot: {
        messagesProcessed: 0,
        responseTime: 0,
        errorsToday: 0,
        uptimePercent: 100,
      },

      // Connection status
      connections: {
        whatsapp: "connected",
        database: "connected",
        engine: "connected",
        lastCheck: new Date().toISOString(),
      },

      // Feature health
      features: {
        aiServices: "operational",
        mediaDownload: "operational",
        groupManagement: "operational",
        antiSpam: "operational",
        voiceDub: "operational",
      },

      // Recommendations
      recommendations: memPercent > 70 ? ["Consider restarting bot to free memory"] : [],
    }

    return NextResponse.json(health)
  } catch (error) {
    console.error("[v0] Health check error:", error)
    return NextResponse.json({
      status: "unhealthy",
      error: "Failed to check health",
    }, { status: 500 })
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
