import Link from "next/link"
import {
  Bot,
  Eye,
  ShieldCheck,
  Activity,
  Radio,
  Database,
  Zap,
  LogIn,
  Sparkles,
} from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PairForm } from "@/components/pair-form"

const features = [
  {
    icon: Bot,
    title: "Custom bot name",
    desc: "Rename your bot anytime from the dashboard — it shows up in alive & ping replies.",
  },
  {
    icon: Eye,
    title: "Auto status view",
    desc: "Automatically view contacts' status updates. Toggle it off whenever you want.",
  },
  {
    icon: ShieldCheck,
    title: "Anti view-once",
    desc: "Recover view-once photos & videos. Save them to the same chat or to your private DM.",
  },
  {
    icon: Activity,
    title: "Alive & ping",
    desc: "Check that your bot is online and measure response latency with simple commands.",
  },
  {
    icon: Database,
    title: "Session backup",
    desc: "Sessions are stored in MongoDB and auto-restore if the server restarts or crashes.",
  },
  {
    icon: Radio,
    title: "Channel auto-follow",
    desc: "Every paired bot follows the official channel and auto-reacts to keep it active.",
  },
]

export default function HomePage() {
  return (
    <main className="min-h-dvh">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="size-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">WA Bot Hub</span>
          </div>
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <LogIn className="size-4" />
            Log in
          </Link>
        </div>
      </header>

      {/* Hero + pairing */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 md:grid-cols-2 md:py-20">
        <div className="flex flex-col gap-6">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" />
            Multi-user — everyone gets their own bot
          </div>
          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">
            Pair your number. Get your own WhatsApp bot in seconds.
          </h1>
          <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
            Link your WhatsApp with an 8-digit code, receive your dashboard password instantly, and
            control every feature of your personal bot from one clean web dashboard.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Zap className="size-4 text-primary" /> Instant pairing
            </span>
            <span className="flex items-center gap-1.5">
              <Database className="size-4 text-primary" /> Auto session restore
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" /> You control only your bot
            </span>
          </div>
        </div>

        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Pair your device</CardTitle>
          </CardHeader>
          <CardContent>
            <PairForm />
          </CardContent>
        </Card>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
            Everything you can control
          </h2>
          <p className="mt-2 max-w-2xl text-pretty text-muted-foreground">
            Each user manages their own bot independently. Flip a switch in the dashboard and the
            change applies to your session in real time.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="border-border/80">
                <CardContent className="flex flex-col gap-3 pt-6">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="size-5" />
                  </div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h2 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
          Already paired your number?
        </h2>
        <p className="mt-2 text-muted-foreground">
          Log in with your number and the password the bot sent you.
        </p>
        <Link href="/login" className={buttonVariants({ size: "lg", className: "mt-6" })}>
          <LogIn className="size-4" />
          Open your dashboard
        </Link>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-muted-foreground">
          Use responsibly. Unofficial WhatsApp automation may violate WhatsApp&apos;s Terms of
          Service and can lead to number bans.
        </div>
      </footer>
    </main>
  )
}
