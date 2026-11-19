import { describe, expect, it } from 'vitest'
import {
  STALE_MS,
  decideAdd,
  decideClose,
  describeClosed,
  describeLeft,
  describeOpened,
  describeResult,
  isStale,
  latestResults,
  panelResults,
  panelShapeIds,
  parseOpenParams,
  parsePanelParams,
  parseToggleParams,
  rankResults,
  tallyVotes,
  voteLabelSuffix,
  votesUsed,
} from './logic'

describe('parseOpenParams', () => {
  it('needs a board and two or more distinct notes', () => {
    expect(parseOpenParams({ shapeIds: ['a', 'b'] })).toEqual({ error: 'Missing board.' })
    expect(parseOpenParams({ boardId: 'b1', shapeIds: ['a'] })).toHaveProperty('error')
    expect(parseOpenParams({ boardId: 'b1', shapeIds: ['a', 'a'] })).toHaveProperty('error')
    expect(parseOpenParams({ boardId: 'b1', shapeIds: 'a,b' })).toHaveProperty('error')
    expect(parseOpenParams({ boardId: 'b1', shapeIds: ['a', ''] })).toHaveProperty('error')
    expect(parseOpenParams({ boardId: 'b1', shapeIds: Array.from({ length: 51 }, (_, i) => `n${i}`) })).toHaveProperty('error')
  })

  it('defaults to one vote each, and caps votes at the number of notes', () => {
    expect(parseOpenParams({ boardId: 'b1', shapeIds: ['a', 'b', 'a'] })).toEqual({ boardId: 'b1', shapeIds: ['a', 'b'], perPerson: 1 })
    expect(parseOpenParams({ boardId: 'b1', shapeIds: ['a', 'b'], perPerson: 2 })).toMatchObject({ perPerson: 2 })
    expect(parseOpenParams({ boardId: 'b1', shapeIds: ['a', 'b'], perPerson: 3 })).toHaveProperty('error')
    expect(parseOpenParams({ boardId: 'b1', shapeIds: ['a', 'b'], perPerson: 0 })).toHaveProperty('error')
    expect(parseOpenParams({ boardId: 'b1', shapeIds: ['a', 'b'], perPerson: 1.5 })).toHaveProperty('error')
  })
})

describe('parseToggleParams / parsePanelParams', () => {
  it('needs a panel (and a note to toggle)', () => {
    expect(parseToggleParams({ panelId: 'p', shapeId: 'a' })).toEqual({ panelId: 'p', shapeId: 'a' })
    expect(parseToggleParams({ shapeId: 'a' })).toHaveProperty('error')
    expect(parseToggleParams({ panelId: 'p' })).toHaveProperty('error')
    expect(parsePanelParams({ panelId: 'p' })).toEqual({ panelId: 'p', leaving: false })
    expect(parsePanelParams({ panelId: 'p', leaving: true })).toEqual({ panelId: 'p', leaving: true })
    expect(parsePanelParams({ panelId: 'x'.repeat(201) })).toHaveProperty('error')
  })
})

describe('decideAdd', () => {
  it('allows votes up to the per-person limit', () => {
    expect(decideAdd(0, 1)).toEqual({ ok: true })
    expect(decideAdd(1, 1)).toMatchObject({ ok: false, code: 'limit', error: expect.stringMatching(/already voted/) })
    expect(decideAdd(2, 3)).toEqual({ ok: true })
    expect(decideAdd(3, 3)).toMatchObject({ ok: false, error: expect.stringMatching(/all 3/) })
  })
})

describe('closing', () => {
  const now = 1_000_000
  const open = { openedBy: 'alex', status: 'open' as const, heartbeatAt: now - 1000 }
  it('the opener can close it any time', () => {
    expect(decideClose(open, 'alex', now)).toEqual({ ok: true, reason: 'closed' })
    expect(decideClose(open, 'alex', now, true)).toEqual({ ok: true, reason: 'opener-left' })
  })
  it('others only once the opener has left (heartbeat stale)', () => {
    expect(decideClose(open, 'sam', now)).toMatchObject({ ok: false, code: 'forbidden' })
    expect(decideClose({ ...open, heartbeatAt: now - STALE_MS }, 'sam', now)).toEqual({ ok: true, reason: 'opener-left' })
  })
  it('not twice', () => {
    expect(decideClose({ ...open, status: 'closed' }, 'alex', now)).toMatchObject({ ok: false, code: 'conflict' })
  })
  it('isStale', () => {
    expect(isStale(now - STALE_MS + 1, now)).toBe(false)
    expect(isStale(now - STALE_MS, now)).toBe(true)
    expect(isStale(Number.NaN, now)).toBe(true)
  })
})

describe('tallyVotes', () => {
  const votes = [
    { panelId: 'p', shapeId: 'a', userId: 'me' },
    { panelId: 'p', shapeId: 'a', userId: 'you' },
    { panelId: 'p', shapeId: 'a', userId: 'you' }, // duplicate row counts once
    { panelId: 'p', shapeId: 'z', userId: 'me' }, // not in the panel
    { panelId: 'old', shapeId: 'b', userId: 'me' }, // another panel
  ]
  it('counts only the panel’s notes, every note included', () => {
    const t = tallyVotes(votes, 'p', ['a', 'b'], 'me')
    expect([...t]).toEqual([
      ['a', { count: 2, mine: true }],
      ['b', { count: 0, mine: false }],
    ])
    expect(votesUsed(t)).toBe(1)
    expect(votesUsed(tallyVotes(votes, 'p', ['a', 'b'], undefined))).toBe(0)
  })
})

describe('results', () => {
  it('ranks by votes, ties in panel order, marking every top note', () => {
    expect(rankResults(['a', 'b', 'c'], { b: 2, c: 2, a: 1 })).toEqual([
      { shapeId: 'b', count: 2, top: true },
      { shapeId: 'c', count: 2, top: true },
      { shapeId: 'a', count: 1, top: false },
    ])
    expect(rankResults(['a', 'b'], {}).every((r) => !r.top)).toBe(true)
  })

  it('reads stored JSON columns either way', () => {
    expect(panelShapeIds({ shapeIds: '["a","b"]' })).toEqual(['a', 'b'])
    expect(panelShapeIds({ shapeIds: ['a'] })).toEqual(['a'])
    expect(panelShapeIds({ shapeIds: 'nope' })).toEqual([])
    expect(panelResults({ results: '{"a":2}' })).toEqual({ a: 2 })
    expect(panelResults({ results: undefined })).toEqual({})
  })

  it('export counts: each note’s most recent closed vote, open ones ignored', () => {
    const panels: Parameters<typeof latestResults>[0] = [
      { status: 'closed' as const, closedAt: 1, shapeIds: ['a', 'b'], results: { a: 1, b: 3 } },
      { status: 'closed' as const, closedAt: 2, shapeIds: ['a'], results: { a: 4 } },
      { status: 'open' as const, shapeIds: ['b'], results: undefined },
    ]
    expect(latestResults(panels)).toEqual(new Map([['a', 4], ['b', 3]]))
  })
})

describe('words', () => {
  it('says what happened', () => {
    expect(describeLeft(1, 3)).toBe('2 of 3 votes left')
    expect(describeResult({ voted: true, count: 1, used: 1, limit: 1 })).toBe('Voted, 1 vote. 0 of 1 vote left')
    expect(describeOpened('Alex', 3, 1)).toBe('Alex opened a vote on 3 notes')
    expect(describeOpened('Alex', 3, 2)).toBe('Alex opened a vote on 3 notes (2 votes each)')
    expect(describeClosed('Alex', 'closed', '“Dark mode” (2)')).toBe('Alex closed the vote. Top: “Dark mode” (2)')
    expect(describeClosed('Alex', 'opener-left', null)).toMatch(/^Alex left, so their vote closed\. No votes/)
    expect(voteLabelSuffix({ count: 2, mine: true })).toBe(', in a vote, 2 votes, including yours')
    expect(voteLabelSuffix(undefined)).toBe('')
  })
})
