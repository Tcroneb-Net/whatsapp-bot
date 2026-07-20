"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  Activity,
  Zap,
  Server,
  Brain,
  ImageIcon,
  Music,
  Download,
  Shield,
  Radio,
  Mic,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Failed to load")
    return r.json()
  })

interface Stats {
  botStatus: string
  botName: string
  uptime: number
  uptimeFormatted: string
  memory: { used: number; total: number }
  features: Record<string, boolean>
  proFeatures: Record<string, boolean>
  prefix: string
  commandsAvailable: number
}

interface Health {
  status: string
  system: {
    memory: { used: number; total: number; percent: number; status: string }
  }
  bot: {
    messagesProcessed: number
    responseTime: number
    errorsToday: number
    uptimePercent: number
  }
  recommendations: string[]
}

interface ProFeature {
  name: string
  enabled: boolean
  description: string
  commands: string[]
  status: string
}

export function ProDashboard() {
  const { data: stats, isLoading: statsLoading } = useSWR<Stats>("/api/dashboard/stats", fetcher, {
    refreshInterval: 30000,
  })

  const { data: health } = useSWR<Health>("/api/dashboard/health", fetcher, {
    refreshInterval: 60000,
  })

  const { data: proFeatures, mutate: mutateFeatures } = useSWR<Record<string, ProFeature>>(
    "/api/dashboard/pro-features",
    fetcher,
    { refreshInterval: 60000 }
  )

  const [togglingFeature, setTogglingFeature] = useState<string | null>(null)

  async function toggleFeature(featureKey: string, currentState: boolean) {
    setTogglingFeature(featureKey)
    try {
      const res = await fetch("/api/dashboard/pro-features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature: featureKey, enabled: !currentState }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Failed to update")
      await mutateFeatures()
      toast.success(`Feature ${!currentState ? "enabled" : "disabled"}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update feature")
    } finally {
      setTogglingFeature(null)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
      case "operational":
      case "connected":
        return "text-green-500"
      case "warning":
        return "text-amber-500"
      case "critical":
      case "error":
        return "text-red-500"
      default:
        return "text-gray-500"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
      case "operational":
      case "connected":
        return <CheckCircle2 className="size-4" />
      case "warning":
        return <AlertTriangle className="size-4" />
      case "critical":
      case "error":
        return <AlertCircle className="size-4" />
      default:
        return <Activity className="size-4" />
    }
  }

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* System Health */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-xl">
            <div className="flex size-8 items-center justify-center rounded-lg bg-green-500/10">
              <Server className="size-5 text-green-500" />
            </div>
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {health && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Memory */}
              <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Memory Usage</span>
                  <Badge variant="outline" className={getStatusColor(health.system.memory.status)}>
                    {health.system.memory.percent}%
                  </Badge>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      health.system.memory.status === "critical"
                        ? "bg-red-500"
                        : health.system.memory.status === "warning"
                          ? "bg-amber-500"
                          : "bg-green-500"
                    }`}
                    style={{ width: `${health.system.memory.percent}%` }}
                  ></div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {health.system.memory.used}MB / {health.system.memory.total}MB
                </p>
              </div>

              {/* Bot Performance */}
              <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Bot Uptime</span>
                  <Badge variant="outline" className="text-green-500">
                    {health.bot.uptimePercent}%
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">Messages: {health.bot.messagesProcessed}</p>
                <p className="text-xs text-muted-foreground">Response: {health.bot.responseTime}ms</p>
              </div>

              {/* Errors */}
              <div className="space-y-2 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Errors Today</span>
                  <Badge variant="outline">{health.bot.errorsToday}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">System: Operational</p>
                <p className="text-xs text-muted-foreground">Status: Healthy</p>
              </div>
            </div>
          )}

          {health?.recommendations && health.recommendations.length > 0 && (
            <>
              <Separator />
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <div className="flex gap-2 text-sm text-amber-700">
                  <AlertTriangle className="size-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium mb-1">Recommendations</p>
                    <ul className="space-y-1 text-xs">
                      {health.recommendations.map((rec, i) => (
                        <li key={i}>• {rec}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pro Features Control */}
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-xl">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="size-5 text-primary" />
            </div>
            Pro Features Control
          </CardTitle>
          <CardDescription>Enable/disable Gladiator Legend powers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {proFeatures &&
            Object.entries(proFeatures).map(([key, feature]) => (
              <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:border-border transition-colors">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-sm">{feature.name}</p>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        feature.status === "active" ? "bg-green-500/10 text-green-700 border-green-200" : ""
                      }`}
                    >
                      {feature.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{feature.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {feature.commands.slice(0, 3).map((cmd, i) => (
                      <code key={i} className="text-xs bg-muted px-2 py-1 rounded">
                        {cmd}
                      </code>
                    ))}
                  </div>
                </div>
                <div className="ml-4 flex-shrink-0">
                  <Switch
                    checked={feature.enabled}
                    disabled={togglingFeature === key}
                    onCheckedChange={() => toggleFeature(key, feature.enabled)}
                  />
                </div>
              </div>
            ))}
        </CardContent>
      </Card>

      {/* Bot Statistics */}
      {stats && (
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-xl">
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10">
                <BarChart3 className="size-5 text-blue-500" />
              </div>
              Bot Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatBox label="Uptime" value={stats.uptimeFormatted} />
            <StatBox label="Command Prefix" value={stats.prefix} />
            <StatBox label="Commands Available" value={stats.commandsAvailable.toString()} />
            <StatBox
              label="Memory Used"
              value={`${stats.memory.used}MB / ${stats.memory.total}MB`}
            />
            <StatBox label="Features Enabled" value={Object.values(stats.features).filter(Boolean).length.toString()} />
            <StatBox label="Bot Status" value={stats.botStatus} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/50 space-y-1">
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}
