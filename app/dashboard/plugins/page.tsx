"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import useSWR from "swr"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Puzzle, Plus, Trash2, Power, ArrowLeft, Zap } from "lucide-react"
import type { Plugin } from "@/lib/types"
import { PRESET_PLUGINS } from "@/lib/preset-plugins"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function PluginsPage() {
  const router = useRouter()
  const { data, mutate, isLoading } = useSWR("/api/plugins", fetcher, { refreshInterval: 30000 })
  const plugins: Plugin[] = data?.plugins ?? []

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [command, setCommand] = useState("")
  const [apiUrl, setApiUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)

  const handleAddPlugin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !command || !apiUrl) {
      toast.error("Fill in all required fields")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, command, apiUrl }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to create plugin")
      }

      toast.success("Plugin created")
      setName("")
      setDescription("")
      setCommand("")
      setApiUrl("")
      setShowForm(false)
      await mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create plugin")
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (pluginId: string, currentEnabled: boolean) => {
    try {
      const res = await fetch("/api/plugins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pluginId, enabled: !currentEnabled }),
      })

      if (!res.ok) throw new Error("Failed to update plugin")
      await mutate()
      toast.success(currentEnabled ? "Plugin disabled" : "Plugin enabled")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update")
    }
  }

  const handleDelete = async (pluginId: string) => {
    if (!confirm("Delete this plugin?")) return

    try {
      const res = await fetch(`/api/plugins?id=${pluginId}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete plugin")
      await mutate()
      toast.success("Plugin deleted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete")
    }
  }

  const handleInstallPreset = async (presetId: string) => {
    setInstalling(presetId)
    try {
      const res = await fetch("/api/plugins/preset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to install preset")
      }

      toast.success("Plugin installed!")
      await mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to install")
    } finally {
      setInstalling(null)
    }
  }

  const isPresetInstalled = (command: string) => {
    return plugins.some((p) => p.command === command)
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="size-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">Plugins</h1>
              <p className="text-muted-foreground">Extend your bot with custom commands</p>
            </div>
          </div>
          <Button onClick={() => setShowForm(!showForm)} className="gap-2">
            <Plus className="size-4" />
            Add Plugin
          </Button>
        </div>

        {showForm && (
          <Card className="mb-6 border-primary/50 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Puzzle className="size-5" />
                Create New Plugin
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddPlugin} className="space-y-4">
                <div>
                  <Label htmlFor="name">Plugin Name *</Label>
                  <Input
                    id="name"
                    placeholder="My Awesome Plugin"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    placeholder="What does this plugin do?"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="command">Command *</Label>
                  <Input
                    id="command"
                    placeholder="mycommand (or .mycommand)"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="apiUrl">API URL *</Label>
                  <Input
                    id="apiUrl"
                    type="url"
                    placeholder="https://api.example.com/plugin"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    required
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={saving}>
                    {saving ? "Creating..." : "Create Plugin"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {isLoading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent>
            </Card>
          ) : plugins.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No plugins yet. Create your first plugin to extend your bot!
              </CardContent>
            </Card>
          ) : (
            plugins.map((plugin) => (
              <Card key={plugin.id} className={plugin.enabled ? "" : "opacity-60"}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Puzzle className="size-4 text-primary" />
                      {plugin.name}
                    </CardTitle>
                    <CardDescription>{plugin.description}</CardDescription>
                  </div>
                  <div className="text-sm font-mono text-muted-foreground">{plugin.command}</div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 break-all text-sm text-muted-foreground">{plugin.apiUrl}</div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={plugin.enabled ? "default" : "outline"}
                      onClick={() => handleToggle(plugin.id, plugin.enabled)}
                      className="gap-2"
                    >
                      <Power className="size-3" />
                      {plugin.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(plugin.id)}
                      className="gap-2"
                    >
                      <Trash2 className="size-3" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="mt-8">
          <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
            <Zap className="size-6 text-yellow-500" />
            Premium Plugins
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {PRESET_PLUGINS.map((preset) => {
              const isInstalled = isPresetInstalled(preset.command)
              return (
                <Card
                  key={preset.id}
                  className={`relative ${preset.featured ? "border-yellow-500/50 bg-yellow-500/5 md:col-span-2" : ""}`}
                >
                  {preset.featured && (
                    <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-yellow-500/20 px-2 py-1 text-xs font-semibold text-yellow-700">
                      <Zap className="size-3" />
                      Featured
                    </div>
                  )}
                  <CardHeader className={preset.featured ? "pb-2" : ""}>
                    <CardTitle className="text-lg">{preset.name}</CardTitle>
                    <CardDescription>{preset.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 text-sm">
                      <p className="text-muted-foreground">Command: {preset.command}</p>
                      <p className="mt-1 text-xs text-muted-foreground break-all">{preset.apiUrl}</p>
                    </div>
                    <Button
                      onClick={() => handleInstallPreset(preset.id)}
                      disabled={isInstalled || installing === preset.id}
                      className="w-full gap-2"
                      variant={isInstalled ? "outline" : "default"}
                    >
                      <Plus className="size-4" />
                      {isInstalled ? "Installed" : installing === preset.id ? "Installing..." : "Quick Add"}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>

        <Card className="mt-8 border-border/50 bg-muted/30">
          <CardHeader>
            <CardTitle>How Plugins Work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Plugins let you add custom commands to your bot by pointing to an external API. When someone uses the
              command, the bot sends a POST request to your API and replies with the response.
            </p>
            <div className="rounded-lg bg-background p-3 font-mono text-xs">
              POST /your-api-url
              <br />
              {"{"} number, command, args, senderJid {"}"}
            </div>
            <p>Your API should respond with:</p>
            <div className="rounded-lg bg-background p-3 font-mono text-xs">
              {`{ response: "Your reply text" }`}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
