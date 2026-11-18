/**
 * Board templates — pure data, built from the existing shape kinds only
 * (sticky, box, text, arrow), so a templated board is an ordinary board.
 *
 * Each template is laid out so its Markdown export (src/spec/buildSpec.ts) is
 * a sensible spec skeleton:
 *  - every section is a named section (`props.section`) with a text label
 *    repeating its name, so the label becomes the heading, not a note;
 *  - prompt notes ("Who is this for?") are stickies in that section;
 *  - arrows between the section labels order the sections.
 *
 * Coordinates are relative to the template's own top-left; seeding moves the
 * whole template so it sits in the middle of the view (see ./instantiate.ts).
 */

import type { ShapeKind } from '@/components/board/types'

export interface TemplateShape {
  /** Stable within the template; arrows refer to shapes by key. */
  key: string
  type: ShapeKind
  x: number
  y: number
  width: number
  height: number
  props: Record<string, unknown>
}

export interface BoardTemplate {
  id: string
  name: string
  /** One short line for the picker. */
  description: string
  shapes: TemplateShape[]
}

/*
 * Sizes are chosen so every template fits a laptop-sized board view (about
 * 1150×660 on a 1440×900 screen, beside the sidebar) clear of the floating
 * controls (see VIEW_MARGIN in ./instantiate.ts), with room above every shape
 * for the section tag the board draws there. One-line prompts (≤ 28
 * characters) go in 64px-high notes; longer ones get 88px.
 */
const LABEL_H = 40
/** Vertical space between shapes: the section tag sits in it. */
const ROW_GAP = 24
const ONE_LINE = { width: 280, height: 64 }

const keyOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** A section's text label: its heading in the spec. */
function label(section: string, x: number, y: number, width: number): TemplateShape {
  return { key: keyOf(section), type: 'text', x, y, width, height: LABEL_H, props: { text: section, section } }
}

function note(
  key: string,
  section: string,
  text: string,
  x: number,
  y: number,
  size: { width: number; height: number },
  extra: Record<string, unknown> = {},
): TemplateShape {
  return { key, type: 'sticky', x, y, ...size, props: { text, section, ...extra } }
}

function arrow(from: string, to: string): TemplateShape {
  return { key: `${from}->${to}`, type: 'arrow', x: 0, y: 0, width: 0, height: 0, props: { from, to, route: 'straight' } }
}

/** Arrows from each section label to the next, so the export keeps this order. */
function chain(sections: string[]): TemplateShape[] {
  return sections.slice(1).map((s, i) => arrow(keyOf(sections[i]), keyOf(s)))
}

/**
 * Sections as rows, read top to bottom like a document: the label on the
 * left, up to three one-line prompt notes to its right. Arrows run down the
 * label column.
 */
function rows(sections: { name: string; prompts: string[] }[]): TemplateShape[] {
  const LABEL_W = 180
  const size = ONE_LINE
  const shapes: TemplateShape[] = []
  sections.forEach(({ name, prompts }, r) => {
    const y = r * (size.height + ROW_GAP)
    shapes.push(label(name, 0, y + (size.height - LABEL_H) / 2, LABEL_W))
    prompts.forEach((p, i) =>
      shapes.push(note(`${keyOf(name)}-${i + 1}`, name, p, LABEL_W + 24 + i * (size.width + 16), y, size)),
    )
  })
  return [...shapes, ...chain(sections.map((s) => s.name))]
}

/** Sections as columns (a retro wall): the label on top, notes stacked under it. */
function columns(sections: { name: string; prompts: string[] }[]): TemplateShape[] {
  const size = { width: 240, height: 88 }
  const shapes: TemplateShape[] = []
  sections.forEach(({ name, prompts }, c) => {
    const x = c * (size.width + 24)
    shapes.push(label(name, x, 0, size.width))
    prompts.forEach((p, i) =>
      shapes.push(note(`${keyOf(name)}-${i + 1}`, name, p, x, LABEL_H + ROW_GAP + i * (size.height + ROW_GAP), size)),
    )
  })
  return [...shapes, ...chain(sections.map((s) => s.name))]
}

/**
 * A user story map: who it's for, then the user's activities left to right
 * (the backbone). Under each activity, stories split into release slices
 * (subsections), "Release 1" first.
 */
function storyMap(): TemplateShape[] {
  const who = 'Who and why'
  const activities: { name: string; first: string; later: string }[] = [
    { name: 'Discover', first: 'As a …, I want to find …', later: 'A nicer way to discover' },
    { name: 'Get started', first: 'As a …, I want to set up …', later: 'A faster setup' },
    { name: 'Do the job', first: 'As a …, I want … so that …', later: 'Power-user stories' },
    { name: 'Come back', first: 'Pick up where I left off', later: 'What brings them back?' },
  ]
  // Five columns: narrower, two-line notes.
  const size = { width: 200, height: 88 }
  const stride = size.width + 20
  const SUB_H = 40
  const shapes: TemplateShape[] = [
    label(who, 0, 0, size.width),
    note('who-1', who, 'Who is the user?', 0, LABEL_H + ROW_GAP, size),
    note('who-2', who, 'What goal brings them here?', 0, LABEL_H + ROW_GAP + size.height + ROW_GAP, size),
  ]
  const arrows: TemplateShape[] = []
  activities.forEach(({ name, first, later }, i) => {
    const x = (i + 1) * stride
    const k = keyOf(name)
    let y = 0
    shapes.push(label(name, x, y, size.width))
    y += LABEL_H + ROW_GAP
    for (const [sub, text] of [
      ['Release 1', first],
      ['Later', later],
    ] as const) {
      const subKey = `${k}-${keyOf(sub)}`
      shapes.push({
        key: subKey,
        type: 'text',
        x,
        y,
        width: size.width,
        height: SUB_H,
        props: { text: sub, section: name, subsection: sub, textColor: 'gray' },
      })
      y += SUB_H + ROW_GAP
      shapes.push(note(`${subKey}-1`, name, text, x, y, size, { subsection: sub }))
      y += size.height + ROW_GAP
    }
    // Release 1 before Later, inside every activity.
    arrows.push(arrow(`${k}-release-1`, `${k}-later`))
  })
  return [...shapes, ...chain([who, ...activities.map((a) => a.name)]), ...arrows]
}

export const TEMPLATES: BoardTemplate[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'An empty board.',
    shapes: [],
  },
  {
    id: 'feature-spec',
    name: 'Feature spec',
    description: 'Problem, users, goals, requirements, scope and open questions.',
    shapes: rows([
      { name: 'Problem', prompts: ['What problem are we solving?', 'What if we do nothing?'] },
      { name: 'Users', prompts: ['Who is this for?', 'What are they trying to do?'] },
      { name: 'Goals', prompts: ['What does success look like?', 'How will we measure it?'] },
      { name: 'Requirements', prompts: ['Must have: …', 'Should have: …', 'Nice to have: …'] },
      { name: 'Out of scope', prompts: ['What are we not doing?'] },
      { name: 'Open questions', prompts: ['What is still undecided?', 'Who can answer it?'] },
    ]),
  },
  {
    id: 'story-map',
    name: 'User story map',
    description: "Who it's for, then their journey left to right, with stories sliced into releases.",
    shapes: storyMap(),
  },
  {
    id: 'retro',
    name: 'Retro',
    description: "What went well, what didn't, ideas, and the actions you agree on.",
    shapes: columns([
      { name: 'Went well', prompts: ['What helped us?', 'What should we keep doing?'] },
      { name: "Didn't go well", prompts: ['What slowed us down?', 'What surprised us?'] },
      { name: 'Ideas', prompts: ['What could we try next time?'] },
      { name: 'Action items', prompts: ['Action — owner — due date'] },
    ]),
  },
  {
    id: 'api-design',
    name: 'API design',
    description: 'Consumers, resources, endpoints, auth, errors and open questions.',
    shapes: rows([
      { name: 'Overview', prompts: ['What can clients do with it?', 'Who calls it? (web, mobile)'] },
      { name: 'Resources', prompts: ['Main resource and its fields', 'How the resources relate'] },
      { name: 'Endpoints', prompts: ['GET /items — list, paged', 'POST /items — create', 'GET/PATCH/DELETE /items/{id}'] },
      { name: 'Auth and limits', prompts: ['Who may call each endpoint?', 'Rate limits and quotas'] },
      { name: 'Errors', prompts: ['Error response format', 'Expected: 400, 404, 409, 429'] },
      { name: 'Open questions', prompts: ['Versioning? Paging style?', 'What is still undecided?'] },
    ]),
  },
]

export const DEFAULT_TEMPLATE_ID = 'blank'

export function templateById(id: string | null | undefined): BoardTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id)
}
