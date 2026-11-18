import { describe, expect, it } from 'vitest'
import {
  constantTimeEqual,
  expiryFor,
  hashLinkToken,
  linkState,
  newLinkToken,
  normalizeLinkToken,
  TOKEN_RE,
} from './linkTokens'

describe('link tokens', () => {
  it('are 22 base64url chars (128 bits) and unique', () => {
    const tokens = new Set(Array.from({ length: 200 }, newLinkToken))
    expect(tokens.size).toBe(200)
    for (const t of tokens) expect(t).toMatch(TOKEN_RE)
  })

  it('normalizes only well-formed tokens', () => {
    const t = newLinkToken()
    expect(normalizeLinkToken(` ${t} `)).toBe(t)
    expect(normalizeLinkToken(t.slice(1))).toBeNull()
    expect(normalizeLinkToken(`${t}=`)).toBeNull()
    expect(normalizeLinkToken(42)).toBeNull()
    expect(normalizeLinkToken(undefined)).toBeNull()
  })

  it('hashes to hex SHA-256, deterministically', async () => {
    expect(await hashLinkToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const t = newLinkToken()
    expect(await hashLinkToken(t)).toBe(await hashLinkToken(t))
  })

  it('compares in constant time with the right answers', () => {
    expect(constantTimeEqual('abcd', 'abcd')).toBe(true)
    expect(constantTimeEqual('abcd', 'abce')).toBe(false)
    expect(constantTimeEqual('abcd', 'abc')).toBe(false)
    expect(constantTimeEqual('', '')).toBe(true)
  })
})

describe('expiryFor', () => {
  const now = 1_000_000
  it('maps the choices', () => {
    expect(expiryFor('never', now)).toEqual({ expiresAt: undefined })
    expect(expiryFor(undefined, now)).toEqual({ expiresAt: undefined })
    expect(expiryFor('1d', now)).toEqual({ expiresAt: now + 86_400_000 })
    expect(expiryFor('7d', now)).toEqual({ expiresAt: now + 7 * 86_400_000 })
    expect(expiryFor('30d', now)).toEqual({ expiresAt: now + 30 * 86_400_000 })
  })
  it('rejects anything else', () => {
    expect(expiryFor('365d', now)).toBeNull()
    expect(expiryFor('constructor', now)).toBeNull()
    expect(expiryFor(7, now)).toBeNull()
  })
})

describe('linkState', () => {
  it('revoked wins, then expiry', () => {
    expect(linkState({}, 10)).toBe('active')
    expect(linkState({ expiresAt: 11 }, 10)).toBe('active')
    expect(linkState({ expiresAt: 10 }, 10)).toBe('expired')
    expect(linkState({ expiresAt: 5, revokedAt: 3 }, 10)).toBe('revoked')
  })
})
