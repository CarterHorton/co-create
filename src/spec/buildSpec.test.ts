import { describe, expect, it } from 'vitest'
import type { BoardShape } from '@/components/board/types'
import { buildMarkdown, buildSections, clusterByProximity, slug, specFileName } from './buildSpec'

let t = 0
function note(id: string, x: number, y: number, text: string, type = 'sticky', size = 100): BoardShape {
  t += 1000
  return {
    id,
    type,
    x,
    y,
    width: size,
    height: size,
    props: { text },
    createdBy: 'u',
    createdAt: new Date(Date.UTC(2026, 0, 1) + t).toISOString(),
    updatedAt: '',
  }
}
const arrow = (id: string, from: string, to: string): BoardShape => ({
  id,
  type: 'arrow',
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  props: { from, to },
  createdBy: 'u',
  createdAt: new Date(Date.UTC(2026, 0, 1) + (t += 1000)).toISOString(),
  updatedAt: '',
})

describe('clusterByProximity', () => {
  it('chains nearby notes and keeps distant ones apart', () => {
    const a = note('a', 0, 0, 'a')
    const b = note('b', 140, 0, 'b') // 40px from a
    const c = note('c', 280, 0, 'c') // 40px from b, 180 from a — chained in
    const far = note('far', 2000, 0, 'far')
    const groups = clusterByProximity([a, b, c, far], 60)
    expect(groups.map((g) => g.map((s) => s.id))).toEqual([['a', 'b', 'c'], ['far']])
  })

  it('groups notes overlapping a box', () => {
    const frame = note('frame', 0, 0, 'Auth', 'box', 500)
    const inside = note('in', 100, 100, 'login')
    expect(clusterByProximity([frame, inside])).toHaveLength(1)
  })
})

describe('buildSections', () => {
  it('titles a section by its text label and orders notes by arrows before time', () => {
    const label = note('label', 0, -80, 'Onboarding', 'text')
    const first = note('n1', 0, 0, 'Second step') // created first…
    const second = note('n2', 140, 0, 'First step') // …but the arrow says n2 comes first
    const [sec] = buildSections([label, first, second, arrow('x', 'n2', 'n1')])
    expect(sec.title).toBe('Onboarding')
    expect(sec.notes.map((n) => n.text)).toEqual(['First step', 'Second step'])
  })

  it('orders sections by cross-section arrows, then by creation time', () => {
    const late = note('late', 0, 0, 'Deploy') // section created first
    const early = note('early', 1000, 0, 'Build')
    const other = note('other', 2000, 0, 'Unrelated')
    const sections = buildSections([late, early, other, arrow('x', 'early', 'late')])
    expect(sections.map((s) => s.title)).toEqual(['Build', 'Deploy', 'Unrelated'])
    expect(sections[1].after.map((s) => s.title)).toEqual(['Build'])
  })

  it('survives arrow cycles', () => {
    const a = note('a', 0, 0, 'A')
    const b = note('b', 1000, 0, 'B')
    const sections = buildSections([a, b, arrow('1', 'a', 'b'), arrow('2', 'b', 'a')])
    expect(sections.map((s) => s.title)).toEqual(['A', 'B'])
  })

  it('ignores empty notes and dangling arrows', () => {
    const empty = note('e', 0, 0, '   ')
    const a = note('a', 1000, 0, 'A')
    const sections = buildSections([empty, a, arrow('x', 'e', 'a'), arrow('y', 'a', 'gone')])
    expect(sections).toHaveLength(1)
    expect(sections[0].after).toEqual([])
  })
})

describe('named sections', () => {
  const named = (id: string, x: number, text: string, section: string, type = 'sticky') => {
    const n = note(id, x, 0, text, type)
    n.props.section = section
    return n
  }

  it('groups assigned notes by name wherever they are, apart from nearby unassigned notes', () => {
    const login = named('login', 0, 'Email login', 'Authentication')
    const reset = named('reset', 3000, 'Password reset', 'Authentication') // far away
    const neighbour = note('nb', 120, 0, 'Pricing page') // right next to login, unassigned
    const sections = buildSections([login, reset, neighbour])
    expect(sections.map((s) => [s.title, s.notes.map((n) => n.text)])).toEqual([
      ['Authentication', ['Email login', 'Password reset']],
      ['Pricing page', []],
    ])
    expect(sections[0].assigned).toBe(true)
    expect(sections[0].noteCount).toBe(2)
  })

  it('matches names case-insensitively and keeps the first spelling', () => {
    const a = named('a', 0, 'A', 'Billing')
    const b = named('b', 2000, 'B', '  billing ')
    const sections = buildSections([a, b])
    expect(sections).toHaveLength(1)
    expect(sections[0].title).toBe('Billing')
  })

  it('treats a text label inside a named section as a note, not the title', () => {
    const label = named('t', 0, 'Login flow', 'Auth', 'text')
    const n1 = named('n1', 0, 'Magic link', 'Auth')
    const [sec] = buildSections([label, n1])
    expect(sec.title).toBe('Auth')
    expect(sec.notes.map((n) => n.text)).toEqual(['Login flow', 'Magic link'])
  })

  it('links arrows between a named section and a proximity section', () => {
    const md = buildMarkdown(
      'X',
      [named('login', 0, 'Email login', 'Authentication'), note('card', 2000, 0, 'Charge card'), arrow('a', 'login', 'card')],
      { now: new Date('2026-01-01') },
    )
    expect(md).toContain('## 1. Authentication')
    expect(md).toContain('- Email login\n  - → [2. Charge card](#2-charge-card)')
  })
})

describe('buildMarkdown', () => {
  it('writes overview, sections with cross-links, and an order of work', () => {
    const shapes = [
      note('t1', 0, -80, 'Auth', 'text'),
      note('login', 0, 0, 'Email login\nmagic link only'),
      note('t2', 1000, -80, 'Billing', 'text'),
      note('card', 1000, 0, 'Charge card'),
      arrow('a1', 'login', 'card'),
    ]
    const md = buildMarkdown('Launch plan', shapes, { now: new Date('2026-11-17T00:00:00Z') })
    expect(md).toContain('# Launch plan')
    expect(md).toContain('on 2026-11-17')
    expect(md).toContain('| 1 | [Auth](#1-auth) | 1 | — |')
    expect(md).toContain('| 2 | [Billing](#2-billing) | 1 | 1 |')
    expect(md).toContain('## 1. Auth')
    expect(md).toContain('- Email login\n  magic link only\n  - → [2. Billing](#2-billing): Charge card')
    expect(md).toContain('_Comes after: [1. Auth](#1-auth)_')
    expect(md).toContain('- [ ] 2. Billing (1 note)')
  })

  it('counts a note that became its section title', () => {
    const md = buildMarkdown('X', [note('solo', 0, 0, 'Lone idea')], { now: new Date('2026-01-01') })
    expect(md).toContain('| 1 | [Lone idea](#1-lone-idea) | 1 | — |')
    expect(md).toContain('1 section, 1 note, 0 connections.')
  })

  it('handles an empty board', () => {
    expect(buildMarkdown('', [])).toContain('no written notes')
  })

  it('is deterministic', () => {
    const shapes = [note('a', 0, 0, 'A'), note('b', 500, 0, 'B'), arrow('x', 'a', 'b')]
    const now = new Date('2026-01-01')
    expect(buildMarkdown('X', shapes, { now })).toBe(buildMarkdown('X', [...shapes].reverse(), { now }))
  })
})

describe('names', () => {
  it('slugs headings like GitHub and makes safe file names', () => {
    expect(slug('2. Billing & Payments!')).toBe('2-billing--payments')
    expect(specFileName('Launch plan: Q1')).toBe('launch-plan-q1.md')
    expect(specFileName('***')).toBe('board.md')
  })
})
