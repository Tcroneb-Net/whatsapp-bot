"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Plug, Plus, Trash2, RefreshCw } from "lucide-react"
import type { Plugin } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function PluginsManager() {
  const { data, isLoading, mutate } = useSWR("/api/plugins", fetcher)
  const [isAdding, setIsAdding] = useState(false)
  const [formData, setFormData] = useState({ name: "", description: "", apiUrl: "", command: "" })
  const [error, setError] = useState("")

  const plugins = data?.plugins || []

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!formData.name || !formData.apiUrl || !formData.command) {
      setError("Missing required fields")
      return
    }

    try {
      const res = await fetch("/api/plugins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const error = await res.json()
        setError(error.error)
        return
      }

      setFormData({ name: "", description: "", apiUrl: "", command: "" })
      setIsAdding(false)
      mutate()
    } catch (err) {
      setError("Failed to add plugin")
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/plugins?id=${id}`, { method: "DELETE" })
      mutate()
    } catch {
      setError("Failed to delete plugin")
    }
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await fetch("/api/plugins", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled: !enabled }),
      })
      mutate()
    } catch {
      setError("Failed to toggle plugin")
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plug className="size-5 text-primary" />
            Custom plugins
          </CardTitle>
          <CardDescription>Add custom API endpoints as bot commands that execute on demand.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading plugins...</p>
          ) : plugins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No plugins yet. Add one to get started.</p>
          ) : (
            <div className="space-y-2">
              {plugins.map((plugin: Plugin) => (
                <div key={plugin.id} className="flex items-center justify-between rounded-lg border border-border/50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">.{plugin.command}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{plugin.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={plugin.enabled ? "default" : "secondary"}>
                      {plugin.enabled ? "Active" : "Disabled"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggle(plugin.id, plugin.enabled)}
                    >
                      {plugin.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(plugin.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {isAdding ? (
            <form onSubmit={handleAdd} className="space-y-3 rounded-lg border border-border/50 p-4">
              <div className="grid gap-2">
                <Label htmlFor="name" className="text-sm">
                  Plugin name
                </Label>
                <Input
                  id="name"
                  placeholder="My Custom Tool"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="command" className="text-sm">
                  Command (no dot)
                </Label>
                <Input
                  id="command"
                  placeholder="mytool"
                  value={formData.command}
                  onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="apiUrl" className="text-sm">
                  API endpoint
                </Label>
                <Input
                  id="apiUrl"
                  placeholder="https://api.example.com/run"
                  value={formData.apiUrl}
                  onChange={(e) => setFormData({ ...formData, apiUrl: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description" className="text-sm">
                  Description
                </Label>
                <Textarea
                  id="description"
                  placeholder="What does this plugin do?"
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" size="sm">
                  Add plugin
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsAdding(false)
                    setFormData({ name: "", description: "", apiUrl: "", command: "" })
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button onClick={() => setIsAdding(true)} className="w-full" variant="outline">
              <Plus className="mr-2 size-4" />
              Add custom plugin
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
