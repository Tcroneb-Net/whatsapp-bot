import { MongoClient, type Db, type Collection } from "mongodb"
import type { BotDoc } from "./types.js"

// A single auth-state credential blob row, keyed by (number, key).
export interface AuthStateDoc {
  number: string
  key: string
  value: unknown
}

// Recovered view-once media log entry.
export interface ViewOnceLogDoc {
  number: string
  timestamp: Date
  mediaType: "image" | "video"
  sender: string
  caption?: string
  mediaUrl?: string // Base64 or blob URL if stored
  recovered: boolean // True if successfully recovered
}

// Group settings and management.
export interface GroupDoc {
  groupId: string // JID like "123456789@g.us"
  number: string // Bot owner number
  status?: string
  autoClose?: {
    enabled: boolean
    minutes?: number
    closedUntil?: Date
  }
  autoPoll?: {
    enabled: boolean
    schedule?: string
  }
  antiLink?: boolean
  createdAt: Date
  updatedAt: Date
}

// Uploaded image tracking for .edit and .upload commands.
export interface UploadedImageDoc {
  _id?: string
  number: string // Bot owner number
  uploadUrl: string // URL where image can be accessed for edit/operations
  fileType: "image" | "video" | "audio" | "document"
  fileName: string
  fileSize: number
  externalUrl?: string // URL from upload service (top4top, etc)
  timestamp: Date
  expiresAt: Date // TTL: links expire after 30 days
  used: boolean // True if image was already used in .edit command
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

  // Indexes
  await db.collection<BotDoc>("bots").createIndex({ number: 1 }, { unique: true })
  await db
    .collection<AuthStateDoc>("auth_state")
    .createIndex({ number: 1, key: 1 }, { unique: true })
  await db
    .collection<ViewOnceLogDoc>("viewonce_logs")
    .createIndex({ number: 1, timestamp: -1 })
  await db.collection<GroupDoc>("groups").createIndex({ groupId: 1, number: 1 }, { unique: true })
  await db
    .collection<UploadedImageDoc>("uploaded_images")
    .createIndex({ number: 1, timestamp: -1 })
  await db
    .collection<UploadedImageDoc>("uploaded_images")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // TTL index

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

export function viewOnceLogs(): Collection<ViewOnceLogDoc> {
  if (!db) throw new Error("DB not connected")
  return db.collection<ViewOnceLogDoc>("viewonce_logs")
}

export function groups(): Collection<GroupDoc> {
  if (!db) throw new Error("DB not connected")
  return db.collection<GroupDoc>("groups")
}

export function uploadedImages(): Collection<UploadedImageDoc> {
  if (!db) throw new Error("DB not connected")
  return db.collection<UploadedImageDoc>("uploaded_images")
}

export async function closeDb(): Promise<void> {
  await client?.close()
  client = null
  db = null
}
