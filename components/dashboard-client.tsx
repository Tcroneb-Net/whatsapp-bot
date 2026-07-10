"use client"

import { useState } from "react"
import useSWR from "swr"
import { format } from "date-fns"
import {
  Eye,
  EyeOff,
  Heart,
  ShieldCheck,
  Circle,
  Keyboard,
  Radio,
  Activity,
  LogOut,
  Zap,
  Settings,
  Wifi,
  BrainCircuit,
  Clock,
  FileText,
  Puzzle,
  Plus,
  Bot,
  Loader2,
  ImageIcon,
  Sparkles,
  Trash2,
  Save,
  Lock,
  Smile,
} from "lucide-react"
import Link from "next/link"
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
import { SettingsSyncStatus } from "@/components/settings-sync-status"

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

  const EMOJI_SUGGESTIONS = ["❤️", "🔥", "😍", "👍", "🎉", "😂", "🤔", "👏", "🙌", "✨", "💯", "🚀", "😍", "🤩"]

  const settings = draft ?? data?.settings ?? DEFAULT_SETTINGS
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(data?.settings)

  function update<K extends keyof BotSettings>(key: K, value: BotSettings[K]) {
    const base = draft ?? data?.settings ?? DEFAULT_SETTINGS
    setDraft({ ...base, [key]: value })
  }

  function toggleEmoji(emoji: string) {
    const currentEmojis = settings.statusReactEmojis.split(",")
    let newEmojis: string[]

    if (currentEmojis.includes(emoji)) {
      newEmojis = currentEmojis.filter((e) => e !== emoji)
    } else {
      newEmojis = [...currentEmojis, emoji]
    }

    update("statusReactEmojis", newEmojis.join(","))
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
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch (err) {
      console.log("[v0] Logout error:", err)
    }
    // Use window.location for redirect instead of router to avoid initialization issues
    window.location.href = "/login"
  }

  async function deleteSession() {
    setDeleting(true)
    try {
      const res = await fetch("/api/session", { method: "DELETE" })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "Failed to delete session")
      toast.success("Session deleted. You can pair again anytime.")
      // Use window.location for redirect instead of router to avoid initialization issues
      setTimeout(() => {
        window.location.href = "/"
      }, 1000)
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
    <main className="min-h-dvh bg-gradient-to-br from-background via-background to-muted/30">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg">
              <Bot className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold leading-tight">WhatsApp Bot</span>
              <span className="text-xs text-muted-foreground">{formatNumber(initialNumber)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard/plugins">
              <Button variant="outline" size="sm" className="gap-2">
                <Puzzle className="size-4" />
                Plugins
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={logout} className="gap-2">
              <LogOut className="size-4" />
              Log out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        {/* Status card */}
        <Card className={`border-2 shadow-sm transition-all duration-500 animate-fade-in-up ${
          data?.status === "connected"
            ? "border-primary/50 bg-gradient-to-r from-primary/10 to-primary/5 shadow-lg hover:shadow-xl hover:border-primary"
            : "border-border/80 bg-gradient-to-r from-primary/5 to-primary/2 hover:shadow-md"
        }`}>
          <CardContent className="flex items-center justify-between pt-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Connection Status</span>
              <span className={`flex items-center gap-2 font-bold text-lg ${statusConfig.color}`}>
                {data?.status === "connected" ? (
                  <>
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                    </span>
                  </>
                ) : (
                  <Circle className="size-3 fill-current animate-pulse" />
                )}
                {statusConfig.label}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant="secondary" className="font-mono">
                {settings.botName}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatNumber(initialNumber)}</span>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            {/* Settings Sync Status */}
            <SettingsSyncStatus />

            {/* Identity */}
            <Card className="border-border/80 shadow-sm hover:shadow-md transition-shadow animate-fade-in-up" style={{animationDelay: '0.1s'}}>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <Bot className="size-5 text-primary" />
                  </div>
                  Bot Identity
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
            <Card className="border-border/80 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <Eye className="size-5 text-primary" />
                  </div>
                  Status Updates
                </CardTitle>
                <CardDescription>Control how your bot handles contacts&apos; statuses.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ToggleRow
                  icon={settings.autoStatusView ? Eye : EyeOff}
                  label="Auto status view"
                  desc="Automatically mark contacts' status updates as seen."
                  checked={settings.autoStatusView}
                  onChange={(v) => update("autoStatusView", v)}
                />
                {settings.autoStatusView && (
                  <div className="pl-8 flex flex-col gap-3 border-l-2 border-primary/30">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="autoStatusViewDelay" className="text-sm">
                        View delay (seconds): {((settings as any).autoStatusViewDelay || 0)}s
                      </Label>
                      <input
                        id="autoStatusViewDelay"
                        type="range"
                        min="0"
                        max="30"
                        value={(settings as any).autoStatusViewDelay || 0}
                        onChange={(e) => update("autoStatusViewDelay" as any, parseInt(e.target.value))}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">Delay before auto-viewing status (0-30 seconds)</p>
                    </div>
                  </div>
                )}
                <Separator />
                <ToggleRow
                  icon={Heart}
                  label="Auto status like"
                  desc="Automatically like (react to) contacts' status updates."
                  checked={settings.autoStatusReact}
                  onChange={(v) => update("autoStatusReact", v)}
                />
                {settings.autoStatusReact && (
                  <div className="pl-8 flex flex-col gap-3 border-l-2 border-primary/30">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="autoStatusReactDelay" className="text-sm">
                        React delay (seconds): {((settings as any).autoStatusReactDelay || 0)}s
                      </Label>
                      <input
                        id="autoStatusReactDelay"
                        type="range"
                        min="0"
                        max="30"
                        value={(settings as any).autoStatusReactDelay || 0}
                        onChange={(e) => update("autoStatusReactDelay" as any, parseInt(e.target.value))}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">Delay before auto-reacting to status (0-30 seconds)</p>
                    </div>
                    <div className="flex items-center gap-2 py-2">
                      <Smile className="size-4 text-primary" />
                      <Label className="text-sm font-medium">Reaction emojis</Label>
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {EMOJI_SUGGESTIONS.map((emoji) => {
                        const isSelected = settings.statusReactEmojis.includes(emoji)
                        return (
                          <button
                            key={emoji}
                            onClick={() => toggleEmoji(emoji)}
                            className={`flex items-center justify-center h-10 text-lg rounded-lg transition-all duration-200 ${
                              isSelected
                                ? "bg-primary/20 border-2 border-primary ring-2 ring-primary/50 scale-110 shadow-md"
                                : "bg-muted hover:bg-muted/80 border border-border hover:border-primary/50"
                            }`}
                            title={`Toggle ${emoji}`}
                          >
                            {emoji}
                          </button>
                        )
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Selected: {settings.statusReactEmojis.split(",").filter((e) => e).join(", ") || "None"}
                    </p>
                  </div>
                )}
                <Separator />
                <ToggleRow
                  icon={Heart}
                  label="Auto-like status"
                  desc="Automatically heart-react with ❤️ to status updates."
                  checked={(settings as any).autoLikeStatus}
                  onChange={(v) => update("autoLikeStatus" as any, v)}
                />
                {(settings as any).autoLikeStatus && (
                  <div className="pl-8 flex flex-col gap-3 border-l-2 border-primary/30">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="autoLikeDelay" className="text-sm">
                        Like delay (seconds): {((settings as any).autoLikeDelay || 2)}s
                      </Label>
                      <input
                        id="autoLikeDelay"
                        type="range"
                        min="1"
                        max="30"
                        value={(settings as any).autoLikeDelay || 2}
                        onChange={(e) => update("autoLikeDelay" as any, parseInt(e.target.value))}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">Delay before auto-liking status (1-30 seconds)</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* View once */}
            <Card className="border-border/80 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <ShieldCheck className="size-5 text-primary" />
                  </div>
                  Anti View-Once
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
                <ToggleRow
                  icon={Zap}
                  label="Auto-unlock on trigger words"
                  desc="Reply with wow, good, cool, ok, then, what, ummm, or emoji to auto-unlock silently"
                  checked={settings.viewOnceAutoUnlock ?? true}
                  onChange={(v) => update("viewOnceAutoUnlock", v)}
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
            <Card className="border-border/80 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <Activity className="size-5 text-primary" />
                  </div>
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
            <Card className="border-border/80 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <Sparkles className="size-5 text-primary" />
                  </div>
                  AI &amp; Tools
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

            {/* AutoChat */}
            <Card className="border-border/80 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <BrainCircuit className="size-5 text-primary" />
                  </div>
                  AutoChat &amp; DM Replies
                </CardTitle>
                <CardDescription>Automatically reply to direct messages using AI.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                <ToggleRow
                  icon={BrainCircuit}
                  label="Enable AutoChat"
                  desc="Bot automatically replies to all DM messages without needing to be mentioned."
                  checked={(settings as any).autoChatEnabled}
                  onChange={(v) => update("autoChatEnabled" as any, v)}
                />
                {(settings as any).autoChatEnabled && (
                  <>
                    <Separator className="my-3" />
                    <ToggleRow
                      icon={Sparkles}
                      label="Use AI for responses"
                      desc="Generate smart AI responses. When disabled, uses template replies."
                      checked={(settings as any).autoChatUseAI}
                      onChange={(v) => update("autoChatUseAI" as any, v)}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Presence */}
            <Card className="border-border/80 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <Wifi className="size-5 text-primary" />
                  </div>
                  Presence &amp; Behaviour
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

            {/* Performance & Pro */}
            <Card className="border-border/80 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <Zap className="size-5 text-primary" />
                  </div>
                  Performance &amp; Pro Options
                </CardTitle>
                <CardDescription>Optimize bot performance and enable advanced features.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="autoClearCache" className="flex items-center gap-2">
                    <Trash2 className="size-4 text-primary" />
                    Auto-clear cache (hours)
                  </Label>
                  <div className="flex items-center gap-3">
                    <input
                      id="autoClearCache"
                      type="number"
                      min="0"
                      max="24"
                      value={(settings as any).autoClearCacheHours || 6}
                      onChange={(e) => update("autoClearCacheHours" as any, parseInt(e.target.value) || 0)}
                      className="w-24 px-3 py-2 border border-border rounded-md"
                    />
                    <span className="text-sm text-muted-foreground">
                      {(settings as any).autoClearCacheHours === 0
                        ? "Disabled"
                        : `Every ${(settings as any).autoClearCacheHours} hours`}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Set to 0 to disable. Auto-clears search cache to improve performance on free tier hosting.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Group Control */}
            <Card className="border-border/80 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <Lock className="size-5 text-primary" />
                  </div>
                  Group Work Mode
                </CardTitle>
                <CardDescription>Control message counting and group locking.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ToggleRow
                  icon={Lock}
                  label="Enable Group Work"
                  desc="Automatically count messages and lock group at threshold."
                  checked={(settings as any).groupWorkEnabled}
                  onChange={(v) => update("groupWorkEnabled" as any, v)}
                />
                {(settings as any).groupWorkEnabled && (
                  <>
                    <Separator />
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="groupThreshold" className="text-sm">
                        Message Threshold: {(settings as any).groupWorkThreshold || 50}
                      </Label>
                      <input
                        id="groupThreshold"
                        type="range"
                        min="10"
                        max="500"
                        step="10"
                        value={(settings as any).groupWorkThreshold || 50}
                        onChange={(e) => update("groupWorkThreshold" as any, parseInt(e.target.value))}
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        Group locks after this many messages are sent
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="autoUnlock" className="text-sm">
                        Auto-Unlock (minutes): {(settings as any).groupAutoUnlockMinutes || "Manual"}
                      </Label>
                      <input
                        id="autoUnlock"
                        type="number"
                        min="0"
                        max="1440"
                        placeholder="0 for manual"
                        value={(settings as any).groupAutoUnlockMinutes || 0}
                        onChange={(e) => update("groupAutoUnlockMinutes" as any, parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-border rounded-md"
                      />
                      <p className="text-xs text-muted-foreground">
                        Set to 0 to require manual unlock with .gunlock command
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Danger zone */}
            <Card className="border-destructive/40 shadow-sm hover:shadow-md transition-shadow bg-destructive/5">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl text-destructive">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-destructive/10">
                    <Trash2 className="size-5 text-destructive" />
                  </div>
                  Delete Session
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
            <Card className="border-border/80 shadow-sm hover:shadow-md transition-shadow">
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

            {/* Group Management */}
            <Card className="border-border/80 shadow-sm hover:shadow-md transition-shadow animate-fade-in-up" style={{animationDelay: '0.5s'}}>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <ShieldCheck className="size-5 text-primary" />
                  </div>
                  Group Management
                </CardTitle>
                <CardDescription>Control group features and automation settings.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                {/* Anti-Link Section */}
                <div className="space-y-4 pb-4 border-b border-border/50">
                  <h3 className="text-sm font-semibold">Anti-Link Protection</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="antiLink" className="font-medium">Enable anti-link</Label>
                      <p className="text-xs text-muted-foreground mt-1">Block users from posting links</p>
                    </div>
                    <Switch
                      id="antiLink"
                      checked={settings.groupSettings?.antiLink ?? false}
                      onCheckedChange={(checked) =>
                        update("groupSettings", {
                          ...settings.groupSettings,
                          antiLink: checked,
                        })
                      }
                    />
                  </div>
                  {settings.groupSettings?.antiLink && (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="antiLinkAction">Action when link is posted</Label>
                      <select
                        id="antiLinkAction"
                        value={settings.groupSettings?.antiLinkAction ?? "warn"}
                        onChange={(e) =>
                          update("groupSettings", {
                            ...settings.groupSettings,
                            antiLinkAction: e.target.value as "warn" | "kick" | "mute",
                          })
                        }
                        className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="warn">⚠️ Warn (message)</option>
                        <option value="mute">🤐 Mute (warning)</option>
                        <option value="kick">���� Kick (remove)</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Auto Open/Close Section */}
                <div className="space-y-4 pb-4 border-b border-border/50">
                  <h3 className="text-sm font-semibold">Schedule Group Access</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="autoOpenTime">Auto open time</Label>
                      <Input
                        id="autoOpenTime"
                        type="time"
                        value={settings.groupSettings?.autoOpenTime ?? ""}
                        onChange={(e) =>
                          update("groupSettings", {
                            ...settings.groupSettings,
                            autoOpenTime: e.target.value || undefined,
                          })
                        }
                        placeholder="HH:mm"
                      />
                      <p className="text-xs text-muted-foreground">Leave empty to disable</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="autoCloseTime">Auto close time</Label>
                      <Input
                        id="autoCloseTime"
                        type="time"
                        value={settings.groupSettings?.autoCloseTime ?? ""}
                        onChange={(e) =>
                          update("groupSettings", {
                            ...settings.groupSettings,
                            autoCloseTime: e.target.value || undefined,
                          })
                        }
                        placeholder="HH:mm"
                      />
                      <p className="text-xs text-muted-foreground">Leave empty to disable</p>
                    </div>
                  </div>
                </div>

                {/* Auto Accept Section */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Auto Accept</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="autoAcceptJoin" className="font-medium">Auto accept join requests</Label>
                        <p className="text-xs text-muted-foreground mt-1">Automatically approve users joining</p>
                      </div>
                      <Switch
                        id="autoAcceptJoin"
                        checked={settings.groupSettings?.autoAcceptJoin ?? false}
                        onCheckedChange={(checked) =>
                          update("groupSettings", {
                            ...settings.groupSettings,
                            autoAcceptJoin: checked,
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="allowTagAll" className="font-medium">Allow .tagall for members</Label>
                        <p className="text-xs text-muted-foreground mt-1">If disabled, only admins can tag everyone</p>
                      </div>
                      <Switch
                        id="allowTagAll"
                        checked={settings.groupSettings?.allowTagAll ?? true}
                        onCheckedChange={(checked) =>
                          update("groupSettings", {
                            ...settings.groupSettings,
                            allowTagAll: checked,
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
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
      <div className="flex items-start gap-3 flex-1">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{label}</span>
            <Badge variant={checked ? "default" : "outline"} className="text-xs">
              {checked ? "ON" : "OFF"}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">{desc}</span>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
