import { describe, expect, it } from 'vitest'
import { codeAnnouncement, describeDuration, formatCountdown, spellCode } from './friendCode'

describe('friend code countdown', () => {
  it('shows minutes and seconds', () => {
    expect(formatCountdown(300)).toBe('5:00')
    expect(formatCountdown(61)).toBe('1:01')
    expect(formatCountdown(29)).toBe('0:29')
    expect(formatCountdown(-3)).toBe('0:00')
  })

  it('spells the code out and names the duration', () => {
    expect(spellCode('3F9A7C21')).toBe('3 F 9 A 7 C 2 1')
    expect(describeDuration(300_000)).toBe('5 minutes')
    expect(describeDuration(60_000)).toBe('1 minute')
    expect(describeDuration(45_000)).toBe('45 seconds')
  })

  it('announces only a new code, the 30 s warning and expiry', () => {
    const issued = { code: '3F9A7C21', ttlMs: 300_000 }
    expect(codeAnnouncement(null, 0)).toBe('')
    const fresh = 'Your code is 3 F 9 A 7 C 2 1, valid for 5 minutes'
    // The text stays the same tick to tick, so the live region stays quiet.
    expect(codeAnnouncement(issued, 300)).toBe(fresh)
    expect(codeAnnouncement(issued, 31)).toBe(fresh)
    expect(codeAnnouncement(issued, 30)).toBe('30 seconds left')
    expect(codeAnnouncement(issued, 1)).toBe('30 seconds left')
    expect(codeAnnouncement(issued, 0)).toBe('Code expired')
  })
})
