import { describe, expect, it } from 'vitest'
import { normalize, projectCounts, visibleBoards, type ListBoard, type ListOptions } from './boardList'

const b = (id: string, over: Partial<ListBoard> = {}): ListBoard => ({
  id,
  title: id,
  ownerId: 'me',
  ownerName: 'You',
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
})

const opts = (over: Partial<ListOptions> = {}): ListOptions => ({
  view: { kind: 'all' },
  query: '',
  sort: 'recent',
  pinned: new Set(),
  userId: 'me',
  ...over,
})

const ids = (list: ListBoard[]) => list.map((x) => x.id)

describe('visibleBoards', () => {
  const boards = [
    b('alpha', { updatedAt: '2026-03-01T00:00:00Z', projectId: 'p1' }),
    b('Beta', { updatedAt: '2026-05-01T00:00:00Z' }),
    b('gamma', { updatedAt: '2026-04-01T00:00:00Z', archived: true, projectId: 'p1' }),
    b('delta', { updatedAt: '2026-02-01T00:00:00Z', ownerId: 'zoe', ownerName: 'Zoe', projectId: '' }),
    b('Éclair', { updatedAt: '2026-01-15T00:00:00Z', ownerId: 'al', ownerName: 'Al', archived: 0 }),
  ]

  it('hides archived boards except in the Archived view', () => {
    expect(ids(visibleBoards(boards, opts()))).toEqual(['Beta', 'alpha', 'delta', 'Éclair'])
    expect(ids(visibleBoards(boards, opts({ view: { kind: 'archived' } })))).toEqual(['gamma'])
  })

  it('filters by project', () => {
    expect(ids(visibleBoards(boards, opts({ view: { kind: 'project', projectId: 'p1' } })))).toEqual(['alpha'])
  })

  it('searches titles case- and accent-insensitively', () => {
    expect(ids(visibleBoards(boards, opts({ query: ' BET ' })))).toEqual(['Beta'])
    expect(ids(visibleBoards(boards, opts({ query: 'ecl' })))).toEqual(['Éclair'])
    expect(visibleBoards(boards, opts({ query: 'nothing' }))).toEqual([])
  })

  it('sorts by name and by owner (yours first)', () => {
    expect(ids(visibleBoards(boards, opts({ sort: 'name' })))).toEqual(['alpha', 'Beta', 'delta', 'Éclair'])
    expect(ids(visibleBoards(boards, opts({ sort: 'owner' })))).toEqual(['alpha', 'Beta', 'Éclair', 'delta'])
  })

  it('puts pinned boards first, keeping the sort within each group', () => {
    const pinned = new Set(['delta', 'alpha'])
    expect(ids(visibleBoards(boards, opts({ pinned })))).toEqual(['alpha', 'delta', 'Beta', 'Éclair'])
  })

  it('falls back to createdAt when there is no updatedAt', () => {
    const list = [b('old', { createdAt: '2025-01-01T00:00:00Z' }), b('new', { createdAt: '2026-06-01T00:00:00Z' })]
    expect(ids(visibleBoards(list, opts()))).toEqual(['new', 'old'])
  })
})

describe('projectCounts', () => {
  it('counts active boards per project', () => {
    const counts = projectCounts([b('a', { projectId: 'p' }), b('b', { projectId: 'p', archived: 1 }), b('c')])
    expect(counts.get('p')).toBe(1)
    expect(counts.size).toBe(1)
  })
})

describe('normalize', () => {
  it('strips accents and case', () => {
    expect(normalize('  CaFÉ ')).toBe('cafe')
  })
})
