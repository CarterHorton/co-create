/**
 * Pure helpers for view-only share links (src/actions/links.ts): token
 * generation, hashing, constant-time comparison, expiry choices and the
 * "is this link usable" check. No worker dependencies, so they are unit
 * tested directly (linkTokens.test.ts).
 */

/** 16 random bytes = 128 bits, base64url without padding = 22 characters. */
export const TOKEN_BYTES = 16
export const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/

export const EXPIRY_CHOICES = ['never', '1d', '7d', '30d'] as const
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number]

const DAY_MS = 24 * 60 * 60_000
const EXPIRY_MS: Record<Exclude<ExpiryChoice, 'never'>, number> = { '1d': DAY_MS, '7d': 7 * DAY_MS, '30d': 30 * DAY_MS }

function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A fresh link token from the CSPRNG (128 bits). */
export function newLinkToken(): string {
  const buf = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(buf)
  return base64url(buf)
}

/** The token as typed or pasted, or null if it can't be one of ours. */
export function normalizeLinkToken(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const token = raw.trim()
  return TOKEN_RE.test(token) ? token : null
}

/** Hex SHA-256 of the token: the only form that is stored. */
export async function hashLinkToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Compare two strings without an early exit on the first difference. */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

/** `expiresIn` param → absolute expiry (undefined = never), or null if invalid. */
export function expiryFor(raw: unknown, now: number): { expiresAt: number | undefined } | null {
  if (raw === undefined || raw === null || raw === 'never') return { expiresAt: undefined }
  if (typeof raw !== 'string' || !Object.hasOwn(EXPIRY_MS, raw)) return null
  return { expiresAt: now + EXPIRY_MS[raw as keyof typeof EXPIRY_MS] }
}

export type LinkState = 'active' | 'expired' | 'revoked'

export function linkState(link: { expiresAt?: number | null; revokedAt?: number | null }, now: number): LinkState {
  if (link.revokedAt) return 'revoked'
  if (typeof link.expiresAt === 'number' && link.expiresAt <= now) return 'expired'
  return 'active'
}
