"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { format } from "date-fns"
import {
  Bot,
  Eye,
  EyeOff,
  ShieldCheck,
  Activity,
  Radio,
  LogOut,
  Trash2,
  Loader2,
  Save,
  Circle,
  Sparkles,
  Heart,
  ImageIcon,
  Wifi,
  Keyboard,
  BrainCircuit,
  Clock,
  FileText,
  Puzzle,
  Plus,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { DEFAULT_SETTINGS, type BotSettings, type ViewOnceMode, type Plugin } from "@/lib/types"
import { formatNumber } from "@/lib/phone"
import { PluginsManager } from "./plugins-manager"

interface SettingsResponse {
  number: string
  status: "pairing" | "connected" | "disconnected"
  lastSeen: string | null
  settings: BotSettings
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Failed to load")
    return r.json()
  })

export function DashboardClient({ initialNumber }: { initialNumber: string }) {
  const router = useRouter()
  const { data, isLoading, mutate } = useSWR<SettingsResponse>("/api/settings", fetcher, {
    refreshInterval: 15000,
  })
  const { data: logsData } = useSWR("/api/logs?limit=20", fetcher, {
    refreshInterval: 30000,
  })
  const { data: pluginsData, mutate: mutatePlugins } = useSWR("/api/plugins", fetcher, {
    refreshInterval: 60000,
  })
  const [newPluginName, setNewPluginName] = useState("")
  const [newPluginApiUrl, setNewPluginApiUrl] = useState("")
  const [newPluginCommand, setNewPluginCommand] = useState("")
  const [pluginLoading, setPluginLoading] = useState(false)

  const [draft, setDraft] = useState<BotSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const settings = draft ?? data?.settings ?? DEFAULT_SETTINGS
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(data?.settings)

  function update<K extends keyof BotSettings>(key: K, value: BotSettings[K]) {
    const base = draft ?? data?.settings ?? DEFAULT_SETTINGS
    setDraft({ ...base, [key]: value })
  }

  async function save() {
    if (!draft) return
    setSaving(true)
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: draft }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Failed to save")
      await mutate()
      setDraft(null)
      toast.success("Settings saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  async function deleteSession() {
    setDeleting(true)
    try {
      const res = await fetch("/api/session", { method: "DELETE" })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Failed to delete session")
      toast.success("Session deleted. You can pair again anytime.")
      router.push("/")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete session")
      setDeleting(false)
    }
  }

  const status = data?.status ?? "disconnected"
  const statusConfig = {
    connected: { label: "Connected", color: "text-primary" },
    pairing: { label: "Pairing", color: "text-amber-500" },
    disconnected: { label: "Disconnected", color: "text-muted-foreground" },
  }[status]

  return (
    <main className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">Dashboard</span>
              <span className="text-xs text-muted-foreground">{formatNumber(initialNumber)}</span>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="size-4" />
            Log out
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
        {/* Status card */}
        <Card className="border-border/80">
          <CardContent className="flex items-center justify-between pt-6">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">Connection status</span>
              <span className={`flex items-center gap-2 font-semibold ${statusConfig.color}`}>
                <Circle className="size-2.5 fill-current" />
                {statusConfig.label}
              </span>
            </div>
            <Badge variant="secondary" className="font-mono">
              {settings.botName}
            </Badge>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* Identity */}
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Bot className="size-5 text-primary" />
                  Bot identity
                </CardTitle>
                <CardDescription>Customize how your bot presents itself.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="botName">Bot name</Label>
                  <Input
                    id="botName"
                    value={settings.botName}
                    maxLength={40}
                    onChange={(e) => update("botName", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prefix">Command prefix</Label>
                  <Input
                    id="prefix"
                    value={settings.prefix}
                    maxLength={3}
                    className="w-24 font-mono"
                    onChange={(e) => update("prefix", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Commands are triggered with this prefix, e.g.{" "}
                    <code className="font-mono">{settings.prefix}alive</code>
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="welcomeImageUrl" className="flex items-center gap-2">
                    <ImageIcon className="size-4 text-primary" />
                    Welcome / menu image URL
                  </Label>
                  <Input
                    id="welcomeImageUrl"
                    inputMode="url"
                    placeholder="https://example.com/banner.jpg"
                    value={settings.welcomeImageUrl}
                    onChange={(e) => update("welcomeImageUrl", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown on the welcome message and the menu. Leave blank to use the default banner.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Status viewing */}
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Eye className="size-5 text-primary" />
                  Status updates
                </CardTitle>
                <CardDescription>Control how your bot handles contacts&apos; statuses.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                <ToggleRow
                  icon={settings.autoStatusView ? Eye : EyeOff}
                  label="Auto status view"
                  desc="Automatically mark contacts' status updates as seen."
                  checked={settings.autoStatusView}
                  onChange={(v) => update("autoStatusView", v)}
                />
                <Separator />
                <ToggleRow
                  icon={Heart}
                  label="Auto status like"
                  desc="Automatically like (react to) contacts' status updates."
                  checked={settings.autoStatusReact}
                  onChange={(v) => update("autoStatusReact", v)}
                />
                <Separator />
                <div className="py-3 flex flex-col gap-3">

                </div>
              </CardContent>
            </Card>

            {/* View once */}
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldCheck className="size-5 text-primary" />
                  Anti view-once
                </CardTitle>
                <CardDescription>Recover view-once media and choose where it is saved.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                <ToggleRow
                  icon={ShieldCheck}
                  label="Enable anti view-once"
                  desc="Automatically capture view-once photos and videos."
                  checked={settings.antiViewOnce}
                  onChange={(v) => update("antiViewOnce", v)}
                />
                <Separator />
                <div className="py-3">
                  <Label className="text-sm font-medium">Where to save recovered media</Label>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {(["dm", "same"] as ViewOnceMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        disabled={!settings.antiViewOnce}
                        onClick={() => update("viewOnceMode", mode)}
                        className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${
                          settings.viewOnceMode === mode
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <span className="text-sm font-medium">
                          {mode === "dm" ? "Private DM" : "Same chat"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {mode === "dm"
                            ? "Send to your own chat privately."
                            : "Repost in the chat it came from."}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Commands */}
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="size-5 text-primary" />
                  Commands
                </CardTitle>
                <CardDescription>Enable or disable built-in bot commands.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                <ToggleRow
                  icon={Activity}
                  label="Alive check"
                  desc={`Responds to ${settings.prefix}alive to confirm the bot is online.`}
                  checked={settings.aliveEnabled}
                  onChange={(v) => update("aliveEnabled", v)}
                />
                <Separator />
                <ToggleRow
                  icon={Radio}
                  label="Ping check"
                  desc={`Responds to ${settings.prefix}ping with response latency.`}
                  checked={settings.pingEnabled}
                  onChange={(v) => update("pingEnabled", v)}
                />
              </CardContent>
            </Card>

            {/* AI & tools */}
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="size-5 text-primary" />
                  AI &amp; tools
                </CardTitle>
                <CardDescription>
                  Power user commands: AI chat, translation, search, music and downloads.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ToggleRow
                  icon={Sparkles}
                  label="Enable AI & tools"
                  desc={`Allows ${settings.prefix}ai, ${settings.prefix}translate, ${settings.prefix}play, ${settings.prefix}song and more.`}
                  checked={settings.aiEnabled}
                  onChange={(v) => update("aiEnabled", v)}
                />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="aiPersona" className="flex items-center gap-2">
                    <BrainCircuit className="size-4 text-primary" />
                    Train your AI (persona &amp; instructions)
                  </Label>
                  <Textarea
                    id="aiPersona"
                    rows={4}
                    placeholder="e.g. You are a friendly assistant for my shop. Always reply in English, keep answers short, and never share prices."
                    value={settings.aiPersona}
                    onChange={(e) => update("aiPersona", e.target.value)}
                    disabled={!settings.aiEnabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    These instructions are sent to the AI before every{" "}
                    <code className="font-mono">{settings.prefix}ai</code> question, shaping how it
                    responds.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Presence */}
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Wifi className="size-5 text-primary" />
                  Presence &amp; behaviour
                </CardTitle>
                <CardDescription>Control how your bot appears and reacts in chats.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                <ToggleRow
                  icon={Wifi}
                  label="Always online"
                  desc="Keeps your account presence set to online at all times."
                  checked={settings.alwaysOnline}
                  onChange={(v) => update("alwaysOnline", v)}
                />
                <ToggleRow
                  icon={Keyboard}
                  label="Auto typing"
                  desc="Shows a typing indicator before the bot replies to commands."
                  checked={settings.autoTyping}
                  onChange={(v) => update("autoTyping", v)}
                />
              </CardContent>
            </Card>

            {/* Plugins */}
            <PluginsManager />

            {/* Danger zone */}
            <Card className="border-destructive/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-destructive">
                  <Trash2 className="size-5" />
                  Delete session
                </CardTitle>
                <CardDescription>
                  Logs your bot out of WhatsApp and permanently removes your session and settings. You
                  can pair again afterwards.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {confirmDelete ? (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      variant="destructive"
                      onClick={deleteSession}
                      disabled={deleting}
                      className="flex-1"
                    >
                      {deleting ? <Loader2 className="size-4 animate-spin" /> : "Yes, delete everything"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                      className="flex-1 bg-transparent"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => setConfirmDelete(true)} className="bg-transparent">
                    <Trash2 className="size-4" />
                    Delete my session
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Logs & History */}
            <Card className="border-border/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="size-5 text-primary" />
                  Activity log
                </CardTitle>
                <CardDescription>Recently recovered view-once media and bot events.</CardDescription>
              </CardHeader>
              <CardContent>
                {!logsData?.logs || logsData.logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  <div className="space-y-2">
                    {logsData.logs.map((log: any, i: number) => (
                      <div key={i} className="flex items-start gap-3 rounded-lg border border-border/50 p-3">
                        <FileText className="mt-0.5 size-4 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {log.mediaType === "image" ? "📷" : "🎥"} {log.mediaType} from{" "}
                            <code className="text-xs">{log.sender.split("@")[0]}</code>
                          </p>
                          {log.caption && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{log.caption}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(log.timestamp), "MMM d, HH:mm:ss")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Sticky save bar */}
      {dirty && (
        <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <span className="text-sm text-muted-foreground">You have unsaved changes</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={saving}>
                Discard
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function ToggleRow({
  icon: Icon,
  label,
  desc,
  checked,
  onChange,
}: {
  icon: React.ElementType
  label: string
  desc: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{desc}</span>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
