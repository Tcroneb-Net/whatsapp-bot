import { ArrowRight, Bot, Check, Gauge, LockKeyhole, Settings2, Sparkles, Users } from "lucide-react"
import Link from "next/link"
import { PairForm } from "@/components/pair-form"

const features = [
  { icon: Settings2, title: "Your bot, your rules", body: "Change your bot name, command prefix, status behavior, view-once delivery, and AI personality from one private control center." },
  { icon: Sparkles, title: "AI that sounds like you", body: "Train a per-bot persona, turn auto-chat on when you want it, and choose whether AI responds in DMs, groups, or everywhere." },
  { icon: Gauge, title: "Live control", body: "Toggle settings and sync them directly to your WhatsApp session. No shared settings and no changes to other bots." },
]

export default function HomePage() {
  return <main className="min-h-dvh overflow-hidden bg-white text-slate-950">
    <header className="border-b border-violet-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 lg:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="SPIDER MINI home"><span className="flex size-10 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200"><Bot className="size-5" /></span><span className="font-black tracking-[0.2em]">SPIDER MINI</span></Link>
        <Link href="/login" className="inline-flex items-center gap-2 rounded-full border border-violet-200 px-4 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50">Log in <ArrowRight className="size-4" /></Link>
      </div>
    </header>
    <section className="relative mx-auto grid max-w-6xl gap-14 px-5 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-24">
      <div className="absolute -left-24 top-10 -z-0 size-72 rounded-full bg-violet-100/70 blur-3xl" />
      <div className="relative z-10 flex flex-col gap-7">
        <div className="w-fit rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">Private WhatsApp automation, made simple</div>
        <h1 className="max-w-2xl text-balance text-5xl font-black tracking-tight text-slate-950 md:text-7xl">Build a bot that feels <span className="text-violet-600">personal.</span></h1>
        <p className="max-w-xl text-pretty text-lg leading-8 text-slate-600">Pair your number with SPIDER MINI, then manage the experience from a private dashboard. Customize the brand, commands, AI, status tools, and more without affecting anyone else.</p>
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-slate-600"><span className="flex items-center gap-2"><Check className="size-4 text-violet-600" /> Per-bot settings</span><span className="flex items-center gap-2"><LockKeyhole className="size-4 text-violet-600" /> Private access</span><span className="flex items-center gap-2"><Gauge className="size-4 text-violet-600" /> Live sync</span></div>
      </div>
      <div className="relative z-10 rounded-[2rem] border border-violet-100 bg-white p-2 shadow-2xl shadow-violet-100"><div className="rounded-[1.6rem] bg-gradient-to-br from-violet-700 to-indigo-700 p-7 text-white md:p-9"><p className="text-sm font-semibold text-violet-100">START YOUR PRIVATE BOT</p><h2 className="mt-3 text-3xl font-black">Pair your WhatsApp</h2><p className="mt-2 text-sm leading-6 text-violet-100">Enter your number with country code. Your login details are generated securely for your dashboard.</p><div className="mt-7 rounded-2xl bg-white p-5 text-slate-950"><PairForm /></div></div></div>
    </section>
    <section className="border-y border-violet-100 bg-violet-50/60"><div className="mx-auto grid max-w-6xl gap-4 px-5 py-12 lg:grid-cols-3 lg:px-8">{features.map(({ icon: Icon, title, body }) => <article key={title} className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm"><span className="flex size-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700"><Icon className="size-5" /></span><h2 className="mt-5 text-lg font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{body}</p></article>)}</div></section>
    <section className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-14 lg:flex-row lg:items-center lg:justify-between lg:px-8"><div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">Made for control</p><h2 className="mt-2 text-3xl font-black">One dashboard. Every important switch.</h2></div><Link href="/login" className="inline-flex w-fit items-center gap-2 rounded-full bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700">Open dashboard <ArrowRight className="size-4" /></Link></section>
    <footer className="border-t border-violet-100 px-5 py-7 text-center text-xs text-slate-500">SPIDER MINI · Private bot control for your WhatsApp session.</footer>
  </main>
}
