"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Smartphone, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

export function LoginForm() {
  const router = useRouter()
  const [number, setNumber] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Login failed")
      toast.success("Welcome back!")
      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="number">WhatsApp number</Label>
        <div className="relative">
          <Smartphone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="number"
            inputMode="tel"
            placeholder="2348012345678"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="pl-9"
            required
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            type="password"
            placeholder="The password your bot sent you"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-9"
            required
          />
        </div>
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Loader2 className="size-4 animate-spin" /> : "Log in"}
      </Button>
    </form>
  )
}
