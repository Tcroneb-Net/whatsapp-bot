"use client"

import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface SyncStatus {
  isDashboardInSync: boolean
  differences: Array<{ key: string; dashboard: unknown; engine: unknown }>
}

interface BotStatusResponse {
  connected: boolean
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
    checkSync()
    const interval = setInterval(checkSync, 30000) // Check every 30 seconds
    return () => clearInterval(interval)
  }, [])

  if (!status) return null

  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Dashboard Sync Status</CardTitle>
            <CardDescription className="text-xs">
              {status.connected ? "Bot engine connected" : "Bot engine disconnected"}
            </CardDescription>
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
      <CardContent className="flex flex-col gap-2">
        {status.sync.isDashboardInSync ? (
          <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
            <CheckCircle2 className="size-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-400 text-sm">
              All settings are synced. Your bot is using the correct configuration.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
            <AlertCircle className="size-4 text-yellow-600" />
            <AlertDescription className="text-yellow-700 dark:text-yellow-400 text-sm">
              {status.sync.differences.length} setting(s) out of sync. The bot may not be using your latest changes.
            </AlertDescription>
          </Alert>
        )}

        {status.sync.differences.length > 0 && (
          <div className="mt-2 p-3 bg-muted rounded-lg text-xs">
            <p className="font-semibold mb-2">Out of sync settings:</p>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {status.sync.differences.slice(0, 5).map((diff) => (
                <div key={diff.key} className="text-muted-foreground">
                  <span className="font-mono text-xs">{diff.key}</span>
                  <div className="ml-2 text-xs">
                    Dashboard: {JSON.stringify(diff.dashboard).slice(0, 30)}...
                  </div>
                  <div className="ml-2 text-xs">
                    Engine: {JSON.stringify(diff.engine).slice(0, 30)}...
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
          <Alert className="border-red-500/50 bg-red-50 dark:bg-red-950/20">
            <AlertCircle className="size-4 text-red-600" />
            <AlertDescription className="text-red-700 dark:text-red-400 text-sm">
              Error checking sync: {error}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
