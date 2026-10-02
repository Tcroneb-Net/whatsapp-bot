"use client"

import useSWR from "swr"
import { Activity, Bot, CheckCircle2, LogOut, Users, Wifi, WifiOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatNumber } from "@/lib/phone"

const fetcher = (url: string) => fetch(url).then(async (res) => { if (!res.ok) throw new Error("Unable to load dashboard") ; return res.json() })

export function DashboardClient({ initialNumber }: { initialNumber: string }) {
  const { data, error, isLoading } = useSWR("/api/bot-status", fetcher, { refreshInterval: 10000 })
  const capacity = Math.min(Number(data?.capacity?.used ?? 0), 100)
  const connected = data?.connected === true

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    window.location.href = "/"
  }

  return <main className="min-h-dvh bg-[#090909] text-white">
    <header className="border-b border-white/10"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5"><div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center rounded-xl bg-red-600"><Bot className="size-5" /></div><div><div className="font-bold tracking-[0.18em]">SPIDER MINI</div><div className="text-xs text-white/40">{formatNumber(initialNumber)}</div></div></div><Button variant="ghost" onClick={logout} className="text-white/70 hover:bg-white/10 hover:text-white"><LogOut data-icon="inline-start" /> Log out</Button></div></header>
    <section className="mx-auto max-w-5xl px-5 py-10"><div className="mb-8 flex flex-col gap-2"><p className="text-sm font-medium text-red-400">PRIVATE CONTROL CENTER</p><h1 className="text-3xl font-black tracking-tight md:text-4xl">Welcome to SPIDER MINI</h1><p className="text-white/50">Only the essentials. Your connection and capacity at a glance.</p></div>
      {error && <Card className="mb-5 border-red-500/30 bg-red-500/10 text-white"><CardContent className="pt-6">Dashboard connection failed. Refresh the page or check the engine status.</CardContent></Card>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-white/10 bg-white/[0.04] text-white"><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Connection</CardTitle>{isLoading ? <Badge variant="secondary">Checking</Badge> : <Badge variant={connected ? "default" : "destructive"}>{connected ? "Connected" : "Offline"}</Badge>}</CardHeader><CardContent><div className="flex items-center gap-3 text-white/70">{connected ? <Wifi className="size-5 text-emerald-400" /> : <WifiOff className="size-5 text-red-400" />}<span>{connected ? "WhatsApp session is online" : "WhatsApp session is not connected"}</span></div><div className="mt-5 text-sm text-white/40">Engine: {data?.engineReachable ? "reachable" : "unreachable"}</div></CardContent></Card>
        <Card className="border-white/10 bg-white/[0.04] text-white"><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Live capacity</CardTitle><Users className="size-5 text-red-400" /></CardHeader><CardContent><div className="flex items-end justify-between"><div><span className="text-4xl font-black">{capacity}</span><span className="ml-2 text-white/40">/ 100 users</span></div><span className="text-sm text-white/50">{100 - capacity} spaces left</span></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-red-500 transition-[width]" style={{ width: `${capacity}%` }} /></div><p className="mt-3 text-xs text-white/40">Capacity updates automatically.</p></CardContent></Card>
      </div>
      <Card className="mt-4 border-white/10 bg-white/[0.04] text-white"><CardHeader><CardTitle>SPIDER MINI is ready</CardTitle></CardHeader><CardContent className="grid gap-4 text-sm text-white/60 sm:grid-cols-3"><div className="flex gap-3"><CheckCircle2 className="size-5 shrink-0 text-red-400" /><span>Pairing and session status are monitored live.</span></div><div className="flex gap-3"><Activity className="size-5 shrink-0 text-red-400" /><span>Bot commands run from your WhatsApp session.</span></div><div className="flex gap-3"><Bot className="size-5 shrink-0 text-red-400" /><span>Your dashboard is private to your number.</span></div></CardContent></Card>
    </section>
  </main>
}
