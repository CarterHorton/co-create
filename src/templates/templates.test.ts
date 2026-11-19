import { describe, expect, it } from 'vitest'
import type { BoardShape } from '@/components/board/types'
import { buildMarkdown, buildSections } from '@/spec/buildSpec'
import { centredOrigin, instantiateTemplate, templateBounds, VIEW_MARGIN } from './instantiate'
import { TEMPLATES, templateById, type BoardTemplate } from './templates'
import { templateOutline } from './TemplatePicker'

const NOW = new Date(Date.UTC(2026, 10, 18))

/** What the board would hold after seeding (the server stamps its own createdAt). */
function seeded(t: BoardTemplate, origin = { x: 0, y: 0 }): BoardShape[] {
  let n = 0
  return instantiateTemplate(t, { origin, now: NOW, newId: () => `id-${++n}` }).map((s) => ({
    ...(s as BoardShape),
    createdBy: 'u',
    createdAt: new Date(NOW.getTime() + 60_000).toISOString(),
    updatedAt: '',
  }))
}

const EXPECTED: Record<string, string[]> = {
  blank: [],
  'feature-spec': ['Problem', 'Users', 'Goals', 'Requirements', 'Out of scope', 'Open questions'],
  'story-map': ['Who and why', 'Discover', 'Get started', 'Do the job', 'Come back'],
  retro: ['Went well', "Didn't go well", 'Ideas', 'Action items'],
  'api-design': ['Overview', 'Resources', 'Endpoints', 'Auth and limits', 'Errors', 'Open questions'],
}

describe('templates', () => {
  it('has the expected catalog with unique ids, Blank first', () => {
    expect(TEMPLATES.map((t) => t.id)).toEqual(Object.keys(EXPECTED))
    expect(TEMPLATES[0].shapes).toEqual([])
    expect(templateById('nope')).toBeUndefined()
  })

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s: keys are unique and every arrow endpoint exists', (_, t) => {
    const keys = t.shapes.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
    const nodes = new Set(t.shapes.filter((s) => s.type !== 'arrow').map((s) => s.key))
    for (const a of t.shapes.filter((s) => s.type === 'arrow')) {
      expect(nodes.has(String(a.props.from)), `${a.key} from`).toBe(true)
      expect(nodes.has(String(a.props.to)), `${a.key} to`).toBe(true)
    }
    // Only the existing shape kinds.
    for (const s of t.shapes) expect(['sticky', 'box', 'text', 'arrow']).toContain(s.type)
  })

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s: non-arrow shapes do not overlap', (_, t) => {
    const boxes = t.shapes.filter((s) => s.type !== 'arrow')
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]]
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
        expect(overlap, `${a.key} overlaps ${b.key}`).toBe(false)
      }
    }
  })

  it.each(TEMPLATES.map((t) => [t.id, t] as const))('%s: builds a spec with the expected sections, in order', (id, t) => {
    const shapes = seeded(t)
    const sections = buildSections(shapes)
    expect(sections.map((s) => s.title)).toEqual(EXPECTED[id])
    expect(templateOutline(t)).toEqual(EXPECTED[id])
    // Every section is named, and its label became the heading rather than a note.
    for (const s of sections) {
      expect(s.assigned).toBe(true)
      expect(s.titleShape?.props.text).toBe(s.title)
      expect(s.noteCount).toBeGreaterThan(0)
    }
    // Arrows chain the sections, so each one comes after the previous.
    sections.slice(1).forEach((s, i) => expect(s.after.map((a) => a.title)).toEqual([sections[i].title]))

    const md = buildMarkdown(t.name, shapes, { now: NOW })
    const headings = md.split('\n').filter((l) => l.startsWith('## ') && !/^## (Overview|Order of work)$/.test(l))
    expect(headings).toEqual(EXPECTED[id].map((name, i) => `## ${i + 1}. ${name}`))
  })

  it('feature spec lists its prompts as notes under each heading', () => {
    const md = buildMarkdown('Feature spec', seeded(templateById('feature-spec')!), { now: NOW })
    expect(md).toContain('## 2. Users\n\n_Comes after: [1. Problem](#1-problem) · Leads to: [3. Goals](#3-goals)_')
    expect(md).toContain('- Who is this for?\n- What are they trying to do?')
    expect(md).toContain('Build the sections in number order')
  })

  it('story map slices every activity into Release 1, then Later', () => {
    const sections = buildSections(seeded(templateById('story-map')!))
    for (const s of sections.slice(1)) {
      expect(s.subsections.map((x) => x.title)).toEqual(['Release 1', 'Later'])
      expect(s.subsections[1].after.map((x) => x.title)).toEqual(['Release 1'])
      for (const sub of s.subsections) expect(sub.notes).toHaveLength(1)
    }
  })
})

describe('instantiateTemplate', () => {
  it('gives fresh ids, re-points arrows, offsets positions and keeps notes before arrows', () => {
    const t = templateById('retro')!
    const out = instantiateTemplate(t, { origin: { x: 100, y: 50 }, now: NOW, newId: (() => { let n = 0; return () => `n${++n}` })() })
    expect(out).toHaveLength(t.shapes.length)
    const ids = new Set(out.map((s) => s.id))
    expect(ids.size).toBe(out.length)
    const firstArrow = out.findIndex((s) => s.type === 'arrow')
    expect(out.slice(firstArrow).every((s) => s.type === 'arrow')).toBe(true)
    for (const a of out.slice(firstArrow)) {
      expect(ids.has(String(a.props!.from))).toBe(true)
      expect(ids.has(String(a.props!.to))).toBe(true)
    }
    const src = t.shapes[0]
    expect(out[0]).toMatchObject({ x: src.x + 100, y: src.y + 50, width: src.width, height: src.height })
    // Creation order rides in props, one ms apart.
    expect(out.map((s) => Date.parse(String(s.props!.originalCreatedAt)) - NOW.getTime())).toEqual(out.map((_, i) => i))
  })
})

describe('centredOrigin', () => {
  it('centres the template between the margins', () => {
    const bounds = { x: 0, y: 0, width: 400, height: 200 }
    const view = { width: 1000, height: 800 }
    const o = centredOrigin(bounds, view)
    const left = o.x - VIEW_MARGIN.left
    const right = view.width - VIEW_MARGIN.right - (o.x + bounds.width)
    const top = o.y - VIEW_MARGIN.top
    const bottom = view.height - VIEW_MARGIN.bottom - (o.y + bounds.height)
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1)
  })

  it('centres in the whole view when it fits only there', () => {
    expect(centredOrigin({ x: 0, y: 0, width: 990, height: 600 }, { width: 1000, height: 620 })).toEqual({ x: 5, y: 10 })
  })

  it('pins a template too big for the view to the top-left margin', () => {
    expect(centredOrigin({ x: 10, y: 20, width: 3000, height: 3000 }, { width: 800, height: 600 })).toEqual({
      x: VIEW_MARGIN.left - 10,
      y: VIEW_MARGIN.top - 20,
    })
  })

  // A 1440×900 screen leaves the board about 1150×660 beside the sidebar.
  it('every real template fits a laptop board view, clear of its controls', () => {
    for (const t of TEMPLATES.filter((x) => x.shapes.length)) {
      const b = templateBounds(t)
      expect(b.width, t.id).toBeLessThanOrEqual(1150 - VIEW_MARGIN.left - VIEW_MARGIN.right)
      expect(b.height, t.id).toBeLessThanOrEqual(660 - VIEW_MARGIN.top - VIEW_MARGIN.bottom)
    }
  })
})
