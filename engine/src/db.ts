import { MongoClient, type Db, type Collection } from "mongodb"
import type { BotDoc } from "./types.js"

// Auth state for WhatsApp sessions - ESSENTIAL DATA
export interface AuthStateDoc {
  number: string
  key: string
  value: unknown
}

let client: MongoClient | null = null
let db: Db | null = null

export async function connectDb(): Promise<Db> {
  if (db) return db
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017"
  const mongoDb = process.env.MONGODB_DB || "whatsapp_bot"
  client = new MongoClient(mongoUri)
  await client.connect()
  db = client.db(mongoDb)

  // Indexes - Keep only essential session and bot data
  await db.collection<BotDoc>("bots").createIndex({ number: 1 }, { unique: true })
  await db
    .collection<AuthStateDoc>("auth_state")
    .createIndex({ number: 1, key: 1 }, { unique: true })

  return db
}

export function bots(): Collection<BotDoc> {
  if (!db) throw new Error("DB not connected")
  return db.collection<BotDoc>("bots")
}

export function authState(): Collection<AuthStateDoc> {
  if (!db) throw new Error("DB not connected")
  return db.collection<AuthStateDoc>("auth_state")
}



export async function closeDb(): Promise<void> {
  await client?.close()
  client = null
  db = null
}
