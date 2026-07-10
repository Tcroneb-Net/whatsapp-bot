import { Card } from "@/components/ui/card"
import { Zap, Lock, Shield, Sparkles } from "lucide-react"

export function DashboardBanner() {
  return (
    <div className="space-y-4 mb-6">
      {/* Main Hero Banner */}
      <Card className="relative overflow-hidden bg-gradient-to-r from-blue-600 via-blue-500 to-emerald-500 border-0 shadow-lg">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>
        <div className="relative p-8 flex items-center justify-between">
          <div className="space-y-3 flex-1">
            <h1 className="text-4xl font-bold text-white">WhatsApp Bot Dashboard</h1>
            <p className="text-blue-100 text-lg">
              Advanced automation with AI, group control, and anti-spam protection
            </p>
          </div>
          <div className="hidden md:block">
            <div className="w-32 h-32 bg-white/20 rounded-full flex items-center justify-center">
              <div className="w-24 h-24 bg-white/30 rounded-full flex items-center justify-center">
                <Sparkles className="w-12 h-12 text-white" />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Features Grid Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-200/50 p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">AI Powered</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">Smart responses</p>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-200/50 p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Lock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Group Control</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">Lock & manage</p>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5 border-red-200/50 p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Shield className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Anti-Spam</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">Protect groups</p>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-200/50 p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <Zap className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white">Auto Status</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400">View & react</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
