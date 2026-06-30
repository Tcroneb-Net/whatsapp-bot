"use client"

import { useState } from "react"
import Link from "next/link"
import { Loader2, Smartphone, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

export function PairForm() {
  const [number, setNumber] = useState("")
  const [loading, setLoading] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [password, setPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setCode(null)
    setPassword(null)
    try {
      const res = await fetch("/api/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to request code")
      setCode(data.code)
      if (data.password) setPassword(data.password)
      toast.success("Pairing code generated. Enter it in WhatsApp now.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function copyCode() {
    if (!code) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="number">WhatsApp number (with country code)</Label>
          <div className="relative">
            <Smartphone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="number"
              inputMode="tel"
              placeholder="e.g. 2348012345678"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="pl-9"
              required
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Digits only — country code first, no spaces, no plus sign.
          </p>
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Get pairing code"}
        </Button>
      </form>

      {code && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium text-foreground">Your 8-digit pairing code</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-mono text-2xl font-bold tracking-[0.3em] text-primary">{code}</span>
            <Button variant="outline" size="sm" onClick={copyCode} className="shrink-0 bg-transparent">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Open WhatsApp on your phone.</li>
            <li>Go to Settings → Linked Devices → Link a device.</li>
            <li>Tap “Link with phone number instead” and enter this code.</li>
          </ol>
          <p className="mt-3 text-xs text-muted-foreground">
            Once linked, the bot will also DM you this password. Then{" "}
            <Link href="/login" className="font-medium text-primary underline-offset-2 hover:underline">
              log in here
            </Link>{" "}
            to control your bot.
          </p>
        </div>
      )}

      {password && (
        <div className="rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-sm font-medium text-foreground">Your dashboard password</p>
          <p className="mt-2 font-mono text-lg font-bold tracking-wider text-foreground">{password}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Save this now. Use your number and this password to log in. The bot will also DM it to you
            after linking.
          </p>
        </div>
      )}
    </div>
  )
}
