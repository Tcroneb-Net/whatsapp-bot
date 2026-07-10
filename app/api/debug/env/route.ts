import { NextResponse } from "next/server"

export async function GET() {
  // This endpoint helps debug environment variable configuration
  const engineUrl = process.env.ENGINE_URL
  const engineKey = process.env.ENGINE_API_KEY
  const mongoUri = process.env.MONGODB_URI ? "***set***" : "not set"
  
  const info = {
    environment: process.env.NODE_ENV,
    engineUrl: engineUrl ? `${engineUrl.substring(0, 50)}...` : "NOT SET ❌",
    engineUrlFull: engineUrl,
    engineApiKey: engineKey ? "***set***" : "not set",
    mongodbUri: mongoUri,
    timestamp: new Date().toISOString(),
    allEnvKeys: Object.keys(process.env)
      .filter(k => !k.startsWith('npm_'))
      .filter(k => k.includes('ENGINE') || k.includes('MONGO') || k.includes('API'))
      .sort(),
  }
  
  return NextResponse.json(info)
}
