import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "@japofc/baileys"
import { authState } from "./db.js"

// Keep this module entirely ESM. @japofc/baileys uses top-level await, so a
// CommonJS require() here makes Node reject the whole dependency graph.

// A MongoDB-backed implementation of Baileys' auth state. Storing credentials in
// MongoDB (instead of the local filesystem) is what lets a bot's session survive
// a crash/restart and auto-restore on next boot.
//
// Each value is serialized with Baileys' BufferJSON so Buffers round-trip safely.

async function readData(number: string, key: string): Promise<unknown> {
  const doc = await authState().findOne({ number, key })
  if (!doc) return null
  return JSON.parse(JSON.stringify(doc.value), BufferJSON.reviver)
}

async function writeData(number: string, key: string, value: unknown): Promise<void> {
  const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer))
  await authState().updateOne(
    { number, key },
    { $set: { number, key, value: serialized } },
    { upsert: true },
  )
}

async function removeData(number: string, key: string): Promise<void> {
  await authState().deleteOne({ number, key })
}

export interface MongoAuthState {
  state: AuthenticationState
  saveCreds: () => Promise<void>
}

export async function useMongoAuthState(number: string): Promise<MongoAuthState> {
  const storedCreds = (await readData(number, "creds")) as AuthenticationCreds | null
  const creds: AuthenticationCreds = storedCreds || initAuthCreds()

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: SignalDataTypeMap[typeof type] } = {}
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(number, `${type}-${id}`)
              if (type === "app-state-sync-key" && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value as object)
              }
              data[id] = value as SignalDataTypeMap[typeof type]
            }),
          )
          return data
        },
        set: async (data) => {
          const tasks: Promise<void>[] = []
          for (const category in data) {
            const categoryData = (data as Record<string, Record<string, unknown>>)[category]
            for (const id in categoryData) {
              const value = categoryData[id]
              const key = `${category}-${id}`
              tasks.push(value ? writeData(number, key, value) : removeData(number, key))
            }
          }
          await Promise.all(tasks)
        },
      },
    },
    saveCreds: async () => {
      await writeData(number, "creds", creds)
    },
  }
}

// Wipe every credential row for a number (used when deleting a session).
export async function clearMongoAuthState(number: string): Promise<void> {
  await authState().deleteMany({ number })
}
