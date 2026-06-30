// Normalize a user-entered phone number into a bare E.164 digit string
// (no "+", spaces, or dashes). Returns null if it does not look valid.
export function normalizeNumber(input: string): string | null {
  const digits = (input || "").replace(/[^0-9]/g, "")
  if (digits.length < 8 || digits.length > 15) return null
  return digits
}

export function formatNumber(number: string): string {
  return `+${number}`
}
