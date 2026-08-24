import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth"
import { DashboardClient } from "@/components/dashboard-client"

export const metadata = {
  title: "Spider Mini Dashboard",
  description: "Professional WhatsApp bot management, group automation, music, and media control",
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect("/login")

  return <DashboardClient initialNumber={session.number} />
}
