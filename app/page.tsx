import { Activity, Bot, CheckCircle2, LockKeyhole, Users } from "lucide-react"
import { PairForm } from "@/components/pair-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-[#090909] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-red-600 text-white"><Bot className="size-5" /></div>
            <span className="text-lg font-bold tracking-[0.18em]">SPIDER MINI</span>
          </div>
        </div>
      </header>
      <section className="mx-auto grid max-w-5xl gap-10 px-5 py-14 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-24">
        <div className="flex flex-col gap-6">
          <div className="flex w-fit items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300"><Activity className="size-3.5" /> Live pairing is open</div>
          <h1 className="max-w-xl text-balance text-4xl font-black tracking-tight md:text-6xl">Your WhatsApp. Your bot. <span className="text-red-500">SPIDER MINI.</span></h1>
          <p className="max-w-lg text-pretty text-lg leading-relaxed text-white/60">Pair your number securely and get a private bot workspace built for fast commands, media, groups, and AI.</p>
          <div className="grid max-w-lg gap-3 sm:grid-cols-3">
            {[['Private', LockKeyhole], ['Fast', Activity], ['Personal', CheckCircle2]].map(([label, Icon]) => <div key={String(label)} className="flex items-center gap-2 text-sm text-white/70"><Icon className="size-4 text-red-500" />{String(label)}</div>)}
          </div>
        </div>
        <Card className="border-white/10 bg-white/[0.04] text-white shadow-2xl shadow-red-950/20">
          <CardHeader><CardTitle className="text-xl">Pair your WhatsApp</CardTitle></CardHeader>
          <CardContent><PairForm /></CardContent>
        </Card>
      </section>
      <section className="border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto grid max-w-5xl gap-4 px-5 py-10 sm:grid-cols-3">
          {[['Private control', 'Your bot settings belong to your number only.'], ['Always visible', 'See your connection state from one clean dashboard.'], ['Built for 100', 'SPIDER MINI capacity is tracked live as people pair.']].map(([title, body]) => <div key={title} className="rounded-2xl border border-white/10 p-5"><h2 className="font-semibold">{title}</h2><p className="mt-2 text-sm leading-relaxed text-white/50">{body}</p></div>)}
        </div>
      </section>
      <footer className="border-t border-white/10 px-5 py-6 text-center text-xs text-white/40">SPIDER MINI · Use responsibly.</footer>
    </main>
  )
}
