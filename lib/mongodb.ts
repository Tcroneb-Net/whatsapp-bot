import { MongoClient, type Db, type Collection } from "mongodb"
import type { BotDoc } from "./types"

export interface ViewOnceLogDoc {
  number: string
  timestamp: Date
  mediaType: "image" | "video"
  sender: string
  caption?: string
  mediaUrl?: string
  recovered: boolean
}

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB || "whatsapp_bot"

if (!uri) {
  // We throw lazily inside getDb so the build does not fail when the env var
  // is not yet configured. This message guides the user.
  console.warn("[v0] MONGODB_URI is not set. Database features will not work until it is configured.")
}

// Reuse the client across hot reloads / serverless invocations.
let clientPromise: Promise<MongoClient> | undefined

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined
}

function getClient(): Promise<MongoClient> {
  if (!uri) {
    throw new Error("MONGODB_URI is not configured. Add it in Project Settings > Vars.")
  }
  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = new MongoClient(uri).connect()
    }
    return global._mongoClientPromise
  }
  if (!clientPromise) {
    clientPromise = new MongoClient(uri).connect()
  }
  return clientPromise
}

export async function getDb(): Promise<Db> {
  const client = await getClient()
  return client.db(dbName)
}

export async function getBots(): Promise<Collection<BotDoc>> {
  const db = await getDb()
  return db.collection<BotDoc>("bots")
}

export async function getViewOnceLogs(): Promise<Collection<ViewOnceLogDoc>> {
  const db = await getDb()
  const collection = db.collection<ViewOnceLogDoc>("viewonce_logs")
  await collection.createIndex({ number: 1, timestamp: -1 })
  return collection
}
