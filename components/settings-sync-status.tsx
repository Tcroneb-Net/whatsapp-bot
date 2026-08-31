"use client"

import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface SyncStatus {
  isDashboardInSync: boolean
  differences: Array<{ key: string; dashboard: unknown; engine: unknown }>
}

interface BotStatusResponse {
  connected: boolean
  engineReachable: boolean
  dashboardSettings: Record<string, unknown>
  engineStatus: Record<string, unknown> | null
  sync: SyncStatus
}

export function SettingsSyncStatus() {
  const [status, setStatus] = useState<BotStatusResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkSync = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/bot-status")
      if (!res.ok) throw new Error("Failed to fetch sync status")
      const data = await res.json()
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const initialCheck = window.setTimeout(() => void checkSync(), 0)
    const interval = window.setInterval(() => void checkSync(), 30000) // Check every 30 seconds
    return () => {
      window.clearTimeout(initialCheck)
      window.clearInterval(interval)
    }
  }, [])

  if (!status) return null

  return (
    <Card className={`border-border/80 ${status.sync.isDashboardInSync ? "border-green-500/30 bg-green-50/30 dark:bg-green-950/10" : "border-yellow-500/30 bg-yellow-50/30 dark:bg-yellow-950/10"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Dashboard Sync Status
                {status.sync.isDashboardInSync ? (
                  <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300">
                    <CheckCircle2 className="size-3 mr-1" /> In Sync
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-yellow-300">
                    <AlertCircle className="size-3 mr-1" /> Out of Sync
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                {status.engineReachable
                  ? status.connected
                    ? "Dashboard ↔ engine connected · WhatsApp connected"
                    : "Dashboard ↔ engine connected · WhatsApp pairing"
                  : "Dashboard ↔ engine disconnected"}
              </CardDescription>
            </div>
          </div>
          <button
            onClick={checkSync}
            disabled={loading}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className={`p-3 rounded-lg text-sm ${status.sync.isDashboardInSync ? "bg-green-100/50 dark:bg-green-900/20 text-green-800 dark:text-green-300" : "bg-yellow-100/50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300"}`}>
          {status.sync.isDashboardInSync ? (
            "All settings are synced. Your bot is using the correct configuration."
          ) : (
            `${status.sync.differences.length} setting(s) out of sync. The bot may not be using your latest changes.`
          )}
        </div>

        {status.sync.differences.length > 0 && (
          <div className="p-3 bg-muted/50 rounded-lg text-xs border border-border/50">
            <p className="font-semibold mb-2">Out of sync settings:</p>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {status.sync.differences.slice(0, 5).map((diff) => (
                <div key={diff.key} className="text-muted-foreground space-y-1">
                  <span className="font-mono text-xs bg-muted px-2 py-1 rounded block">{diff.key}</span>
                  <div className="ml-2 text-xs">
                    Dashboard: {String(diff.dashboard).slice(0, 40)}...
                  </div>
                  <div className="ml-2 text-xs">
                    Engine: {String(diff.engine).slice(0, 40)}...
                  </div>
                </div>
              ))}
            </div>
            {status.sync.differences.length > 5 && (
              <p className="text-xs text-muted-foreground mt-2">
                +{status.sync.differences.length - 5} more...
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-100/50 dark:bg-red-900/20 rounded-lg text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
            <AlertCircle className="size-4 mt-0.5 flex-shrink-0" />
            <span>Error checking sync: {error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
