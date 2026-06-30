import { randomBytes } from "crypto"

// Generate a human-friendly password (no ambiguous characters) for the
// dashboard. Shown on screen and DM'd to the user once on successful pairing.
export function generatePassword(length = 10): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
  const bytes = randomBytes(length)
  let out = ""
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length]
  }
  return out
}
