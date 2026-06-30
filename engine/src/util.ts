// Strip everything except digits. WhatsApp numbers are stored bare (no +).
export function normalizeNumber(input: string): string {
  return (input || "").replace(/[^0-9]/g, "")
}

// Sleep helper.
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
