import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { DashboardClient } from "@/components/dashboard-client"

export const metadata = {
  title: "Gladiator Bot Dashboard",
  description: "Professional WhatsApp bot management and pro features control",
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  return <DashboardClient initialNumber={session.number} />
}
