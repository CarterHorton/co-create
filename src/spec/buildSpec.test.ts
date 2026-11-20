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

describe('subsections', () => {
  const part = (id: string, x: number, text: string, section: string, subsection?: string, type = 'sticky') => {
    const n = note(id, x, 0, text, type)
    n.props.section = section
    if (subsection) n.props.subsection = subsection
    return n
  }

  it('splits a named section into its subsections, keeping section-wide notes apart', () => {
    const shapes = [
      part('stack', 0, 'Use React', 'Front-end'),
      part('form', 200, 'Email + password form', 'Front-end', 'Login page'),
      part('chart', 3000, 'Usage chart', 'Front-end', 'Dashboard'),
      part('reset', 400, 'Forgot password link', 'Front-end', ' login PAGE '),
    ]
    const [sec] = buildSections(shapes)
    expect(sec.title).toBe('Front-end')
    expect(sec.notes.map((n) => n.text)).toEqual(['Use React'])
    expect(sec.subsections.map((x) => [x.index, x.title, x.notes.map((n) => n.text)])).toEqual([
      [1, 'Login page', ['Email + password form', 'Forgot password link']],
      [2, 'Dashboard', ['Usage chart']],
    ])
    expect(sec.subsections[0].anchor).toBe('11-login-page')
    expect(sec.noteCount).toBe(4)
  })

  it('ignores a subsection on a note with no named section', () => {
    const n = note('n', 0, 0, 'Loose')
    n.props.subsection = 'Orphan'
    const [sec] = buildSections([n])
    expect(sec.subsections).toEqual([])
  })

  it('orders subsections by arrows and writes them as ### headings with cross-links', () => {
    const shapes = [
      part('stack', 0, 'Use React', 'Front-end'),
      part('chart', 200, 'Usage chart', 'Front-end', 'Dashboard'), // created first…
      part('form', 400, 'Login form', 'Front-end', 'Login page'),
      part('label', 600, 'Login page', 'Front-end', 'Login page', 'text'), // its label: the title, not a note
      arrow('a', 'form', 'chart'), // …but login leads to the dashboard
    ]
    const md = buildMarkdown('App', shapes, { now: new Date('2026-01-01') })
    expect(md).toContain('A `###` heading is a subsection')
    expect(md).toContain("Notes listed before a section's first subsection apply to the whole section.")
    expect(md).toContain(
      [
        '## 1. Front-end',
        '',
        '- Use React',
        '',
        '### 1.1 Login page',
        '',
        '- Login form',
        '  - → [1.2 Dashboard](#12-dashboard): Usage chart',
        '',
        '### 1.2 Dashboard',
        '',
        '_Comes after: [1.1 Login page](#11-login-page)_',
        '',
        '- Usage chart',
        '',
      ].join('\n'),
    )
    expect(md).toContain('| 1 | [Front-end](#1-front-end) — [1.1 Login page](#11-login-page), [1.2 Dashboard](#12-dashboard) | 3 |')
    expect(md).not.toMatch(/\n\n\n/)
  })

  it('says when subsections are independent', () => {
    const md = buildMarkdown(
      'App',
      [part('a', 0, 'Form', 'Front-end', 'Login'), part('b', 200, 'Chart', 'Front-end', 'Dashboard')],
      { now: new Date('2026-01-01') },
    )
    expect(md).toContain("No arrows connect its subsections, so they don't depend on each other")
    expect(md).not.toContain('apply to the whole section')
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
    expect(md).toContain('**How to read this:**')
    expect(md).toContain('2 sections, 2 notes, 1 connection (1 written as →).')
    expect(md).toContain('| 1 | [Auth](#1-auth) | 1 | — |')
    expect(md).toContain('| 2 | [Billing](#2-billing) | 1 | 1 |')
    expect(md).toContain(
      '## 1. Auth\n\n_Leads to: [2. Billing](#2-billing)_',
    )
    // Line breaks inside a box are joined into one line.
    expect(md).toContain('- Email login magic link only\n  - → [2. Billing](#2-billing): Charge card')
    expect(md).toContain('_Comes after: [1. Auth](#1-auth)_')
    expect(md).toContain('## Order of work\n\nBuild the sections in number order')
    expect(md).toContain('1. [Auth](#1-auth) — can start right away\n2. [Billing](#2-billing) — after 1')
  })

  it('reads a real board the way a person would (replica of a hand-made test board)', () => {
    const named = (id: string, x: number, y: number, text: string, section: string, type = 'box') => {
      const n = note(id, x, y, text, type)
      n.props.section = section
      return n
    }
    const shapes = [
      named('authLabel', 200, 40, 'Authentication', 'Authentication', 'text'),
      named('opts', 100, 250, 'Authentication Options', 'Authentication'),
      named('gh', 320, 150, 'Auth through GitHub', 'Authentication'),
      named('gg', 320, 250, 'Auth through Google', 'Authentication'),
      named('em', 320, 360, 'Auth through Email', 'Authentication'),
      arrow('a1', 'opts', 'gh'),
      arrow('a2', 'opts', 'gg'),
      arrow('a3', 'opts', 'em'),
      named('board', 610, 200, 'Create new board', 'Create New Idea'),
      named('blocks', 750, 190, 'Create blocks \nand\nsticky notes!', 'Create New Idea'),
      named('conn', 920, 190, 'Create Connections\nAnd\nGraph Ideas Together', 'Create New Idea'),
      named('export', 1090, 190, 'Export as markdown\nfie for your\nAgents!!!', 'Create New Idea'),
      arrow('b1', 'board', 'blocks'),
      arrow('b2', 'blocks', 'conn'),
      arrow('b3', 'conn', 'blocks'),
      arrow('b4', 'conn', 'export'),
    ]
    const md = buildMarkdown('Test board', shapes, { now: new Date('2026-11-17') })

    // The label that repeats the section name is the title, not a note.
    expect(md).not.toMatch(/^- Authentication$/m)
    // No section depends on another, so there's no empty "Comes after" column.
    expect(md).toContain('| # | Section | Notes |\n|---|---|---|\n| 1 | [Authentication](#1-authentication) | 4 |\n')
    // Every connection is accounted for, even the ones shown by layout.
    expect(md).toContain('2 sections, 8 notes, 7 connections (3 shown by indenting, 3 shown as numbered steps, 1 written as ↺).')
    // Fan-out is nested once, not listed twice.
    expect(md).toContain(
      '## 1. Authentication\n\n- Authentication Options\n  - Auth through GitHub\n  - Auth through Google\n  - Auth through Email\n\n',
    )
    // A chain is numbered steps; line breaks are joined; the loop points back to its step.
    expect(md).toContain(
      [
        '## 2. Create New Idea',
        '',
        '_4 steps, each joined to the next by an arrow:_',
        '',
        '1. Create new board',
        '2. Create blocks and sticky notes!',
        '3. Create Connections And Graph Ideas Together (↺ back to step 2: Create blocks and sticky notes!)',
        '4. Export as markdown fie for your Agents!!!',
      ].join('\n'),
    )
    // Unconnected sections are called out as independent.
    expect(md).toContain("No arrows connect the sections, so the board doesn't say that one depends on another")
    // The key explains only what's used: steps, indents and loops, but no → on this board.
    expect(md).toContain('**How to read this:** Numbered notes are a chain of steps')
    expect(md).not.toContain('starting with `→`')
    expect(md).toContain('Bulleted notes are things to build') // the top-level 'Authentication Options'
    expect(md).not.toMatch(/ +$/m) // no trailing spaces
  })

  it('numbers a chain but not a fan-out or a partial chain', () => {
    const chain = buildMarkdown(
      'X',
      [note('a', 0, 0, 'A'), note('b', 120, 0, 'B'), note('c', 240, 0, 'C'), arrow('1', 'a', 'b'), arrow('2', 'b', 'c')],
      { now: new Date('2026-01-01') },
    )
    expect(chain).toContain('1. B\n2. C')
    const partial = buildMarkdown(
      'X',
      [note('t', 0, -80, 'Plan', 'text'), note('a', 0, 0, 'A'), note('b', 120, 0, 'B'), note('c', 240, 0, 'C'), arrow('1', 'a', 'b')],
      { now: new Date('2026-01-01') },
    )
    expect(partial).toContain('- A\n  - → B\n- B\n- C')
  })

  it('keeps lines written as a list as sub-items', () => {
    const md = buildMarkdown('X', [note('t', 0, -80, 'Plan', 'text'), note('n', 0, 0, 'Login page\n- email field\n- password field')], {
      now: new Date('2026-01-01'),
    })
    expect(md).toContain('- Login page\n  - email field\n  - password field')
  })

  it('marks an arrow to an earlier section as a loop', () => {
    const shapes = [note('a', 0, 0, 'Build'), note('b', 2000, 0, 'Ship'), arrow('1', 'a', 'b'), arrow('2', 'b', 'a')]
    const md = buildMarkdown('X', shapes, { now: new Date('2026-01-01') })
    expect(md).toContain('- Ship ↺ back to [1. Build](#1-build)')
  })

  it('counts a note that became its section title', () => {
    const md = buildMarkdown('X', [note('solo', 0, 0, 'Lone idea')], { now: new Date('2026-01-01') })
    expect(md).toContain('| 1 | [Lone idea](#1-lone-idea) | 1 |\n')
    expect(md).not.toContain('_Not named on the board')
    expect(md).toContain('1 section, 1 note, 0 connections.')
    expect(md).toContain('One section: work through [Lone idea](#1-lone-idea) from top to bottom.')
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

describe('export of a framed chain and a labelled premise (Homeless IT board)', () => {
  const steps = [
    'Initial Cutscene',
    'Digs through computers for spare parts',
    'Builds one to completion',
    'Brings to coffee shop',
    'Given first option to sell compute',
    'End of Tuturial',
  ]
  const board = () => {
    const frame = note('frame', 0, 0, 'Starting Area', 'frame')
    frame.width = 840
    frame.height = 460
    const boxes = steps.map((text, i) => note(`s${i}`, 20 + (i % 3) * 260, 40 + Math.floor(i / 3) * 200, text, 'box'))
    const label = note('label', 500, 640, 'General Idea', 'text')
    const premise = note(
      'premise',
      500,
      700,
      'Homeless IT is a satirical game not intended to replicate real life.\nThe premise follows a homeless guy in a big city. The game starts with a cutscene.',
      'box',
      200,
    )
    const chain = steps.slice(1).map((_, i) => arrow(`c${i}`, `s${i}`, `s${i + 1}`))
    return [frame, ...boxes, label, premise, ...chain]
  }

  it('names the labelled group, writes the premise as prose, and shows the chain as a chain', () => {
    const md = buildMarkdown('Homeless IT, initial design', board(), { now: new Date('2026-11-20') })
    expect(md).not.toContain('Not named on the board')
    expect(md).toContain(
      '## 2. General Idea\n\nHomeless IT is a satirical game not intended to replicate real life. The premise',
    )
    expect(md).toContain(
      '## 1. Starting Area\n\n_6 steps, each joined to the next by an arrow:_\n\n1. Initial Cutscene\n2. Digs through computers for spare parts',
    )
    expect(md).toContain('2 sections, 7 notes, 5 connections (5 shown as numbered steps).')
    expect(md).toContain('Numbered notes are a chain of steps')
    expect(md).not.toContain('Bulleted notes')
  })

  it('keeps a short lone note as a bullet: it is still a task', () => {
    const shapes = [
      note('l1', 0, -80, 'Billing', 'text'),
      note('a', 0, 0, 'Charge card'),
      note('l2', 2000, -80, 'Auth', 'text'),
      note('b', 2000, 0, 'Magic link'),
    ]
    const md = buildMarkdown('B', shapes, { now: new Date('2026-01-01') })
    expect(md).toContain('## 1. Billing\n\n- Charge card')
    expect(md).toContain('Bulleted notes are things to build')
  })
})
