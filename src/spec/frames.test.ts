import { describe, expect, it } from 'vitest'
import type { BoardShape } from '@/components/board/types'
import { buildMarkdown, buildSections } from './buildSpec'

let t = 0
function shape(id: string, type: string, x: number, y: number, w: number, h: number, props: Record<string, unknown> = {}): BoardShape {
  t += 1000
  return {
    id,
    type,
    x,
    y,
    width: w,
    height: h,
    props,
    createdBy: 'u',
    createdAt: new Date(Date.UTC(2026, 0, 1) + t).toISOString(),
    updatedAt: '',
  }
}
const frame = (id: string, x: number, y: number, name = '', w = 600, h = 400) => shape(id, 'frame', x, y, w, h, { text: name })
const note = (id: string, x: number, y: number, text: string, props: Record<string, unknown> = {}) =>
  shape(id, 'sticky', x, y, 100, 100, { text, ...props })
const arrow = (id: string, from: string, to: string) => shape(id, 'arrow', 0, 0, 0, 0, { from, to })
const NOW = new Date('2026-03-01T00:00:00Z')

describe('frames in the spec', () => {
  it('turns the notes inside a frame into a section titled with its name', () => {
    // Far apart: proximity alone would make two groups.
    const shapes = [frame('f', 0, 0, 'Login page', 1200, 800), note('a', 20, 40, 'Email field'), note('b', 1000, 600, 'Submit')]
    const [sec, ...rest] = buildSections(shapes)
    expect(rest).toHaveLength(0)
    expect(sec.title).toBe('Login page')
    expect(sec.titleShape?.id).toBe('f')
    expect(sec.notes.map((n) => n.shape.id)).toEqual(['a', 'b'])
    expect(sec.noteCount).toBe(2)
    expect(sec.assigned).toBe(true)
  })

  it('counts only shapes fully inside; one sticking out groups by proximity', () => {
    const shapes = [frame('f', 0, 0, 'Inside', 300, 300), note('in', 10, 40, 'In'), note('out', 250, 40, 'Half out')]
    const secs = buildSections(shapes)
    expect(secs.map((s) => s.title)).toEqual(['Inside', 'Half out'])
  })

  it('puts a note in the innermost of nested frames', () => {
    const shapes = [frame('outer', 0, 0, 'App', 1000, 1000), frame('inner', 50, 50, 'Settings', 300, 300), note('a', 60, 80, 'Theme'), note('b', 600, 600, 'Home')]
    const secs = buildSections(shapes)
    const byTitle = Object.fromEntries(secs.map((s) => [s.title, s.notes.map((n) => n.shape.id)]))
    expect(byTitle).toEqual({ App: ['b'], Settings: ['a'] })
  })

  it('gives an explicit section precedence over the frame, and the frame over proximity', () => {
    const shapes = [
      frame('f', 0, 0, 'Front-end'),
      note('a', 20, 40, 'Login form'),
      note('b', 140, 40, 'Database', { section: 'Back-end' }),
      note('c', 2000, 0, 'Loose'),
    ]
    const byTitle = Object.fromEntries(buildSections(shapes).map((s) => [s.title, s.notes.map((n) => n.shape.id)]))
    expect(byTitle).toEqual({ 'Front-end': ['a'], 'Back-end': ['b'], Loose: [] })
  })

  it('merges a frame with an assigned section of the same name', () => {
    const shapes = [frame('f', 0, 0, 'Auth'), note('a', 20, 40, 'Login'), note('b', 3000, 0, 'Logout', { section: 'auth' })]
    const secs = buildSections(shapes)
    expect(secs).toHaveLength(1)
    expect(secs[0].notes.map((n) => n.shape.id)).toEqual(['a', 'b'])
  })

  it('titles an unnamed frame "Untitled frame" and leaves out an unnamed empty one', () => {
    const shapes = [frame('f', 0, 0), note('a', 20, 40, 'Something'), frame('empty', 5000, 0)]
    const secs = buildSections(shapes)
    expect(secs.map((s) => s.title)).toEqual(['Untitled frame'])
  })

  it('keeps a named empty frame as a section with no notes', () => {
    const secs = buildSections([frame('f', 0, 0, 'Later')])
    expect(secs.map((s) => [s.title, s.noteCount])).toEqual([['Later', 0]])
  })

  it('orders sections by arrows between frames, like arrows between groups', () => {
    const shapes = [
      frame('f2', 1000, 0, 'Dashboard'),
      note('d', 1020, 40, 'Chart'),
      frame('f1', 0, 0, 'Login'),
      note('l', 20, 40, 'Form'),
      arrow('x', 'f1', 'f2'),
    ]
    const secs = buildSections(shapes)
    expect(secs.map((s) => s.title)).toEqual(['Login', 'Dashboard'])
    expect(secs[1].after.map((s) => s.title)).toEqual(['Login'])
    const md = buildMarkdown('B', shapes, { now: NOW })
    expect(md).toContain('- Login → [2. Dashboard](#2-dashboard)')
    expect(md).toContain('2. [Dashboard](#2-dashboard) — after 1')
  })

  it('orders frames by arrows between notes inside them', () => {
    const shapes = [frame('f2', 1000, 0, 'Second'), note('b', 1020, 40, 'B'), frame('f1', 0, 0, 'First'), note('a', 20, 40, 'A'), arrow('x', 'b', 'a')]
    expect(buildSections(shapes).map((s) => s.title)).toEqual(['Second', 'First'])
  })

  it('never lists a frame as a note', () => {
    const md = buildMarkdown('B', [frame('f', 0, 0, 'Login page'), note('a', 20, 40, 'Email')], { now: NOW })
    expect(md).toContain('## 1. Login page\n\n- Email\n')
    expect(md).toContain('1 section, 1 note, 0 connections.')
  })
})

describe('sticky note types in the spec', () => {
  const shapes = () => [
    frame('f', 0, 0, 'Login'),
    note('i', 20, 40, 'Email form'),
    note('q', 140, 40, 'Support SSO?', { noteType: 'question' }),
    note('d', 260, 40, 'Use magic links', { noteType: 'decision' }),
    note('r', 380, 40, 'Bots signing up', { noteType: 'risk' }),
    note('q2', 3000, 0, 'Remember me?', { noteType: 'question', section: 'Later' }),
  ]

  it('prefixes typed notes in their sections', () => {
    const md = buildMarkdown('B', shapes(), { now: NOW })
    expect(md).toContain(
      '## 1. Login\n\n- Email form\n- **Question:** Support SSO?\n- **Decision:** Use magic links\n- **Risk:** Bots signing up\n',
    )
  })

  it('ends with summary lists of questions, decisions and risks, linking each to its section', () => {
    const md = buildMarkdown('B', shapes(), { now: NOW })
    const tail = md.slice(md.indexOf('## Order of work'))
    expect(tail).toContain(
      '## Open questions\n\n- Support SSO? — [1. Login](#1-login)\n- Remember me? — [2. Later](#2-later)\n\n' +
        '## Decisions\n\n- Use magic links — [1. Login](#1-login)\n\n' +
        '## Risks\n\n- Bots signing up — [1. Login](#1-login)\n',
    )
  })

  it('omits empty summary lists, and all of them when no note is typed', () => {
    const one = buildMarkdown('B', [note('r', 0, 0, 'Outage', { noteType: 'risk' }), note('x', 120, 0, 'Plain')], { now: NOW })
    expect(one).toContain('## Risks')
    expect(one).not.toContain('## Open questions')
    expect(one).not.toContain('## Decisions')
    const none = buildMarkdown('B', [note('x', 0, 0, 'Plain'), note('y', 120, 0, 'Idea', { noteType: 'idea' })], { now: NOW })
    expect(none).not.toMatch(/## (Open questions|Decisions|Risks)/)
    expect(none).not.toContain('**Idea:**')
  })

  it('lists a typed note that became its group title', () => {
    const md = buildMarkdown('B', [note('q', 0, 0, 'Which database?', { noteType: 'question' })], { now: NOW })
    expect(md).toContain('## Open questions\n\n- Which database? — [1. Which database?](#1-which-database)')
  })
})
