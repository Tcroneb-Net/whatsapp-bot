import Link from "next/link"
import { redirect } from "next/navigation"
import { Bot, ArrowLeft } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginForm } from "@/components/login-form"
import { getSession } from "@/lib/auth"

export default async function LoginPage() {
  const session = await getSession()
  if (session) redirect("/dashboard")

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back home
        </Link>
        <Card className="border-border/80 shadow-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="size-6" />
            </div>
            <CardTitle className="text-2xl">Log in to your dashboard</CardTitle>
            <CardDescription>
              Use your WhatsApp number and the password the bot sent you after pairing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Haven&apos;t paired yet?{" "}
              <Link href="/" className="font-medium text-primary underline-offset-2 hover:underline">
                Pair your number
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
