import { describe, expect, it } from 'vitest'
import type { BoardShape } from '@/components/board/types'
import { buildMarkdown } from '@/spec/buildSpec'
import {
  MAX_ROUND_LIMIT,
  MAX_STALE_IDS,
  MAX_VOTES_PER_USER,
  aggregateVotes,
  decideAdd,
  describeLeft,
  describeResult,
  parseRoundParams,
  parseToggleParams,
  staleVoteIds,
  topVoted,
  voteLabelSuffix,
  votesUsed,
} from './logic'

const v = (shapeId: string, userId: string) => ({ shapeId, userId })

describe('decideAdd (vote limit)', () => {
  it('allows any number of votes without a round, up to the hard cap', () => {
    expect(decideAdd(0, null).ok).toBe(true)
    expect(decideAdd(40, null).ok).toBe(true)
    expect(decideAdd(MAX_VOTES_PER_USER, null)).toMatchObject({ ok: false, code: 'cap' })
  })

  it('enforces the per-person limit while a round is active', () => {
    const round = { limit: 3, active: true }
    expect(decideAdd(0, round).ok).toBe(true)
    expect(decideAdd(2, round).ok).toBe(true)
    const full = decideAdd(3, round)
    expect(full).toMatchObject({ ok: false, code: 'limit' })
    expect(!full.ok && full.error).toMatch(/all 3 of your votes/)
    expect(decideAdd(7, round).ok).toBe(false)
  })

  it('ignores an ended round', () => {
    expect(decideAdd(5, { limit: 3, active: false }).ok).toBe(true)
  })
})

describe('aggregateVotes', () => {
  const live = new Set(['a', 'b', 'c'])

  it('counts votes per note and marks your own', () => {
    const counts = aggregateVotes([v('a', 'u1'), v('a', 'u2'), v('b', 'u2')], live, 'u1')
    expect(counts.get('a')).toEqual({ count: 2, mine: true })
    expect(counts.get('b')).toEqual({ count: 1, mine: false })
    expect(counts.has('c')).toBe(false)
  })

  it('ignores votes on deleted notes', () => {
    const counts = aggregateVotes([v('a', 'u1'), v('gone', 'u1'), v('gone', 'u2')], live, 'u1')
    expect(counts.has('gone')).toBe(false)
    expect([...counts.keys()]).toEqual(['a'])
  })

  it('counts a duplicate row from the same person once', () => {
    expect(aggregateVotes([v('a', 'u1'), v('a', 'u1')], live, 'u1').get('a')).toEqual({ count: 1, mine: true })
  })

  it('has no "mine" when signed out', () => {
    expect(aggregateVotes([v('a', 'u1')], live, undefined).get('a')).toEqual({ count: 1, mine: false })
  })
})

describe('votesUsed / staleVoteIds', () => {
  const live = new Set(['a', 'b'])
  const votes = [v('a', 'me'), v('b', 'me'), v('gone', 'me'), v('a', 'other'), v('gone2', 'other')]

  it('counts only your votes on live notes', () => {
    expect(votesUsed(votes, live, 'me')).toBe(2)
    expect(votesUsed(votes, live, 'other')).toBe(1)
    expect(votesUsed(votes, live, undefined)).toBe(0)
  })

  it('lists only your votes on deleted notes', () => {
    expect(staleVoteIds(votes, live, 'me')).toEqual(['gone'])
    expect(staleVoteIds(votes, live, undefined)).toEqual([])
  })
})

describe('topVoted', () => {
  it('sorts by count, keeping the given order for ties, and skips notes without votes', () => {
    const notes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const counts = new Map([
      ['b', { count: 1, mine: false }],
      ['c', { count: 3, mine: true }],
      ['d', { count: 1, mine: false }],
    ])
    expect(topVoted(notes, counts).map((x) => [x.note.id, x.count, x.mine])).toEqual([
      ['c', 3, true],
      ['b', 1, false],
      ['d', 1, false],
    ])
    expect(topVoted(notes, counts, 1)).toHaveLength(1)
  })
})

describe('words', () => {
  it('describes what is left and your own vote', () => {
    expect(describeLeft(1, 3)).toBe('2 of 3 votes left')
    expect(describeLeft(5, 3)).toBe('0 of 3 votes left')
    expect(describeLeft(0, 1)).toBe('1 of 1 vote left')
    expect(describeResult({ voted: true, count: 4 })).toBe('Voted, 4 votes')
    expect(describeResult({ voted: false, count: 1 })).toBe('Vote removed, 1 vote')
    expect(describeResult({ voted: true, count: 2, used: 1, limit: 3 })).toBe('Voted, 2 votes. 2 of 3 votes left')
    expect(voteLabelSuffix(undefined)).toBe('')
    expect(voteLabelSuffix({ count: 2, mine: true })).toBe(', 2 votes, including yours')
    expect(voteLabelSuffix({ count: 1, mine: false })).toBe(', 1 vote')
  })
})

describe('parse params', () => {
  it('validates a toggle', () => {
    expect(parseToggleParams({ boardId: 'b', shapeId: 's' })).toEqual({ boardId: 'b', shapeId: 's', staleShapeIds: [] })
    expect(parseToggleParams({ boardId: 'b', shapeId: 's', staleShapeIds: ['x', 'x', 's'] })).toEqual({
      boardId: 'b',
      shapeId: 's',
      staleShapeIds: ['x'],
    })
    expect(parseToggleParams({ boardId: 'b' })).toHaveProperty('error')
    expect(parseToggleParams({ boardId: '', shapeId: 's' })).toHaveProperty('error')
    expect(parseToggleParams({ boardId: 'b', shapeId: 'x'.repeat(201) })).toHaveProperty('error')
    expect(parseToggleParams({ boardId: 'b', shapeId: 's', staleShapeIds: 'x' })).toHaveProperty('error')
    expect(
      parseToggleParams({ boardId: 'b', shapeId: 's', staleShapeIds: Array.from({ length: MAX_STALE_IDS + 1 }, (_, i) => `${i}`) }),
    ).toHaveProperty('error')
  })

  it('validates a round', () => {
    expect(parseRoundParams({ boardId: 'b' })).toEqual({ boardId: 'b', limit: 3, clear: false })
    expect(parseRoundParams({ boardId: 'b', limit: 5, clear: true })).toEqual({ boardId: 'b', limit: 5, clear: true })
    expect(parseRoundParams({ boardId: 'b', limit: 0 })).toHaveProperty('error')
    expect(parseRoundParams({ boardId: 'b', limit: 2.5 })).toHaveProperty('error')
    expect(parseRoundParams({ boardId: 'b', limit: MAX_ROUND_LIMIT + 1 })).toHaveProperty('error')
    expect(parseRoundParams({ boardId: 'b', limit: '3' })).toHaveProperty('error')
    expect(parseRoundParams({ boardId: 'b', clear: 'yes' })).toHaveProperty('error')
  })
})

describe('Markdown export with votes', () => {
  const sticky = (id: string, x: number, text: string): BoardShape => ({
    id,
    type: 'sticky',
    x,
    y: 0,
    width: 100,
    height: 100,
    props: { text },
    createdBy: 'u',
    createdAt: new Date(Date.UTC(2026, 0, 1) + x).toISOString(),
    updatedAt: '',
  })
  // Two notes side by side form one section; the first one's text becomes its title.
  const shapes = [sticky('t', 0, 'Auth'), sticky('a', 120, 'Login'), sticky('b', 240, 'Signup')]
  const now = new Date(Date.UTC(2026, 0, 2))

  it('writes counts next to voted notes only when asked', () => {
    const md = buildMarkdown('Board', shapes, { now, votes: new Map([['a', 3]]) })
    expect(md).toContain('Login (3 votes)')
    expect(md).not.toMatch(/Signup \(/)
    expect(buildMarkdown('Board', shapes, { now })).not.toMatch(/vote/)
    expect(buildMarkdown('Board', shapes, { now, votes: new Map([['a', 1]]) })).toContain('Login (1 vote)')
  })

  it('keeps the votes of a note that became the section title', () => {
    const md = buildMarkdown('Board', shapes, { now, votes: new Map([['t', 2]]) })
    expect(md).toMatch(/## 1\. Auth\n\n_2 votes_\n/)
  })
})
