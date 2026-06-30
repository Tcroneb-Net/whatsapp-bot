import { SignJWT, jwtVerify } from "jose"
import { cookies } from "next/headers"

const COOKIE_NAME = "bot_session"

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured. Add it in Project Settings > Vars.")
  }
  return new TextEncoder().encode(secret)
}

export interface SessionPayload {
  number: string
}

export async function createSession(number: string): Promise<void> {
  const token = await new SignJWT({ number })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret())

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  })
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (typeof payload.number === "string") {
      return { number: payload.number }
    }
    return null
  } catch {
    return null
  }
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}
