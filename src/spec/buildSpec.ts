/**
 * Board → Markdown spec. Deterministic: no AI, same board in, same file out.
 *
 *  1. Sections — notes assigned to a named section (props.section, set from
 *     the selection bar) form that section wherever they are on the board.
 *     Every other note is grouped by proximity: notes whose edges are within
 *     `gap` px of each other (chained, so a row of stickies is one group).
 *     Overlapping counts, so a box drawn around notes groups them.
 *  2. Titles — a named section uses its name; otherwise its text label, else
 *     its box, else the first line of its earliest note.
 *  3. Order — arrows between sections order the sections; arrows inside a
 *     section order its notes. Ties (and cycles) fall back to creation time.
 *  4. Connections — every arrow is written next to the note it starts from,
 *     linking across sections by anchor.
 */

import type { BoardShape } from '@/components/board/types'
import { frameMembership, isFrame } from '@/components/board/frame'
import { specPrefix } from '@/components/board/noteTypes'
import { sectionKeyOf, typeSummaries } from './frames'

export interface SpecOptions {
  /** Max distance (canvas px) between two notes' edges to group them. */
  gap?: number
  /** Export timestamp; injectable for tests. */
  now?: Date
}

export interface SpecNote {
  shape: BoardShape
  text: string
  /** The note as one line (line breaks people add for layout are joined). */
  head: string
  /** Lines the user wrote as a list ("- x", "1. y"), kept as sub-items. */
  items: string[]
}

/**
 * A named part of a named section ("Front-end" → "Login page", "Dashboard"),
 * set from the selection bar. Notes in it are listed under its own heading.
 */
export interface SpecSubsection {
  /** 1-based within its section; arrows between subsections order them, then creation time. */
  index: number
  title: string
  anchor: string
  /** A text label repeating the subsection's name: its title, not a note. */
  titleShape?: BoardShape
  notes: SpecNote[]
  /** Shape ids in this subsection (including the title shape). */
  ids: Set<string>
  after: SpecSubsection[]
}

export interface SpecSection {
  index: number
  title: string
  anchor: string
  /** Shape whose text became the title, if any. */
  titleShape?: BoardShape
  /** Extra lines from a note whose first line became the title. */
  intro: string[]
  /** Notes that belong to the section as a whole (not to one of its subsections). */
  notes: SpecNote[]
  /** Named parts of the section, in order. Only named sections have them. */
  subsections: SpecSubsection[]
  /** Notes in the section and its subsections, counting a note whose first line became the title (not a text/box label). */
  noteCount: number
  /** Named by the user (selection bar) rather than grouped by proximity. */
  assigned: boolean
  /** Shape ids in this section (including the title shape). */
  ids: Set<string>
  after: SpecSection[]
  leadsTo: SpecSection[]
}

const DEFAULT_GAP = 60

const textOf = (s: BoardShape) => (typeof s.props.text === 'string' ? s.props.text.trim() : '')
const LIST_ITEM = /^([-*•]|\d+[.)])\s+/

/**
 * People break lines inside boxes to make them look right ("Create blocks /
 * and / sticky notes!"). Join those into one sentence; keep lines the user
 * wrote as a list ("- a", "1. b") as separate items.
 */
export function noteParts(text: string): { head: string; items: string[] } {
  const prose: string[] = []
  const items: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/\s+/g, ' ')
    if (!line) continue
    if (LIST_ITEM.test(line)) items.push(line.replace(LIST_ITEM, ''))
    else prose.push(line)
  }
  const head = prose.join(' ') || items.shift() || ''
  return { head, items }
}

/** One-line version of a shape's text. */
export const headlineOf = (s: BoardShape) => noteParts(textOf(s)).head

/** Section name a user assigned to this shape, or ''. */
export const sectionNameOf = (s: BoardShape) => (typeof s.props.section === 'string' ? s.props.section.trim() : '')
/** Subsection name within the shape's named section, or '' (a subsection needs a section). */
export const subsectionNameOf = (s: BoardShape) =>
  sectionNameOf(s) && typeof s.props.subsection === 'string' ? s.props.subsection.trim() : ''
/** Creation time; a shape re-added by a version restore carries its original in props. */
const time = (s: BoardShape) =>
  Date.parse(typeof s.props.originalCreatedAt === 'string' ? s.props.originalCreatedAt : s.createdAt) || 0
const byTime = (a: BoardShape, b: BoardShape) => time(a) - time(b) || a.id.localeCompare(b.id)

function rectGap(a: BoardShape, b: BoardShape) {
  const dx = Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width))
  const dy = Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height))
  return Math.hypot(dx, dy)
}

/** GitHub-style heading anchor. */
export function slug(heading: string) {
  return heading
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-')
}

/** Group notes by proximity (single-linkage via union–find). */
export function clusterByProximity(nodes: BoardShape[], gap = DEFAULT_GAP): BoardShape[][] {
  const parent = nodes.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (rectGap(nodes[i], nodes[j]) <= gap) parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, BoardShape[]>()
  nodes.forEach((n, i) => {
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), n])
  })
  return [...groups.values()].map((g) => g.sort(byTime))
}

/** Kahn's topological sort; picks the earliest-created ready item first. Cycles fall back to time order. */
function topoOrder<T>(items: T[], edges: [T, T][], earliest: (a: T, b: T) => number): T[] {
  const indeg = new Map(items.map((i) => [i, 0]))
  const out = new Map<T, T[]>(items.map((i) => [i, []]))
  for (const [a, b] of edges) {
    if (a === b || !indeg.has(a) || !indeg.has(b)) continue
    out.get(a)!.push(b)
    indeg.set(b, indeg.get(b)! + 1)
  }
  const done = new Set<T>()
  const result: T[] = []
  while (result.length < items.length) {
    const ready = items.filter((i) => !done.has(i) && indeg.get(i) === 0).sort(earliest)
    // A cycle leaves nothing ready: break it at the earliest remaining item.
    const next = ready[0] ?? items.filter((i) => !done.has(i)).sort(earliest)[0]
    done.add(next)
    result.push(next)
    for (const b of out.get(next)!) indeg.set(b, indeg.get(b)! - 1)
  }
  return result
}

export function buildSections(shapes: BoardShape[], opts: SpecOptions = {}): SpecSection[] {
  // Frames are section titles (an unnamed, empty one says nothing and is left out).
  const frameOf = frameMembership(shapes)
  const framed = new Set([...frameOf.values()].map((f) => f.id))
  const nodes = shapes.filter((s) => s.type !== 'arrow' && (isFrame(s) ? textOf(s) || framed.has(s.id) : textOf(s)))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const arrows = shapes
    .filter((s) => s.type === 'arrow')
    .map((a) => [byId.get(String(a.props.from)), byId.get(String(a.props.to))] as const)
    .filter((e): e is readonly [BoardShape, BoardShape] => !!e[0] && !!e[1] && e[0] !== e[1])

  // Named sections first (case-insensitive; the first spelling wins), then proximity for the rest.
  const named = new Map<string, { name: string; shapes: BoardShape[] }>()
  for (const n of [...nodes].sort(byTime)) {
    const sk = sectionKeyOf(n, frameOf)
    if (!sk) continue
    const { key, name } = sk
    if (!named.has(key)) named.set(key, { name, shapes: [] })
    named.get(key)!.shapes.push(n)
  }
  const groups: { name?: string; shapes: BoardShape[] }[] = [
    ...named.values(),
    ...clusterByProximity(
      nodes.filter((n) => !sectionKeyOf(n, frameOf)),
      opts.gap ?? DEFAULT_GAP,
    ).map((shapes) => ({ shapes })),
  ]

  const sections: SpecSection[] = groups.map(({ name, shapes: group }) => {
    group = [...group].sort(byTime)
    // A named section's own label ("Authentication" written on the board) is its title, not a note.
    const label = name
      ? (group.find(isFrame) ?? group.find((s) => s.type === 'text' && headlineOf(s).toLowerCase() === name.toLowerCase()))
      : (group.find((s) => s.type === 'text') ?? group.find((s) => s.type === 'box'))
    let title: string
    let intro: string[] = []
    let titleShape: BoardShape | undefined
    let rest = group
    let titleFromNote = false
    if (name) {
      title = name
      if (label) {
        titleShape = label
        rest = group.filter((s) => s !== label)
      }
      rest = rest.filter((s) => !isFrame(s)) // more frames of the same name: titles, not notes
    } else if (label) {
      titleShape = label
      title = headlineOf(label)
      rest = group.filter((s) => s !== label)
    } else {
      const { head, items } = noteParts(textOf(group[0]))
      titleShape = group[0]
      titleFromNote = true
      title = head.length > 80 ? `${head.slice(0, 77)}…` : head
      intro = [...(head.length > 80 ? [head] : []), ...items.map((i) => `- ${i}`)]
      rest = group.slice(1)
    }
    const ids = new Set(group.map((s) => s.id))
    const subsections = name ? buildSubsections(rest.filter(subsectionNameOf)) : []
    const notes = orderNotes(name ? rest.filter((s) => !subsectionNameOf(s)) : rest)
    const noteCount = notes.length + subsections.reduce((n, x) => n + x.notes.length, 0) + (titleFromNote ? 1 : 0)
    return {
      index: 0,
      title,
      anchor: '',
      titleShape,
      intro,
      notes,
      subsections,
      noteCount,
      assigned: !!name,
      ids,
      after: [],
      leadsTo: [],
    }
  })

  /** Notes ordered by the arrows between them, then by creation time. */
  function orderNotes(list: BoardShape[]): SpecNote[] {
    const inner = arrows.filter(([a, b]) => list.includes(a) && list.includes(b)) as [BoardShape, BoardShape][]
    return topoOrder(list, inner, byTime).map((shape) => ({ shape, text: textOf(shape), ...noteParts(textOf(shape)) }))
  }

  /** Split a named section's subsection notes by name (case-insensitive, first spelling wins) and order the parts. */
  function buildSubsections(list: BoardShape[]): SpecSubsection[] {
    const byName = new Map<string, { name: string; shapes: BoardShape[] }>()
    for (const n of [...list].sort(byTime)) {
      const name = subsectionNameOf(n)
      const key = name.toLowerCase()
      if (!byName.has(key)) byName.set(key, { name, shapes: [] })
      byName.get(key)!.shapes.push(n)
    }
    const subs: SpecSubsection[] = [...byName.values()].map(({ name, shapes: members }) => {
      const label = members.find((s) => s.type === 'text' && headlineOf(s).toLowerCase() === name.toLowerCase())
      return {
        index: 0,
        title: name,
        anchor: '',
        titleShape: label,
        notes: orderNotes(members.filter((s) => s !== label)),
        ids: new Set(members.map((s) => s.id)),
        after: [],
      }
    })
    const edges: [SpecSubsection, SpecSubsection][] = []
    for (const [a, b] of arrows) {
      const sa = subs.find((x) => x.ids.has(a.id))
      const sb = subs.find((x) => x.ids.has(b.id))
      if (sa && sb && sa !== sb && !edges.some(([x, y]) => x === sa && y === sb)) edges.push([sa, sb])
    }
    const first = (x: SpecSubsection) => Math.min(...[...x.ids].map((id) => time(byId.get(id)!)))
    const ordered = topoOrder(subs, edges, (a, b) => first(a) - first(b))
    ordered.forEach((x, i) => (x.index = i + 1))
    for (const [a, b] of edges) b.after.push(a)
    for (const x of ordered) x.after.sort((p, q) => p.index - q.index)
    return ordered
  }

  const sectionOf = (s: BoardShape) => sections.find((sec) => sec.ids.has(s.id))!
  const earliest = (sec: SpecSection) => Math.min(...[...sec.ids].map((id) => time(byId.get(id)!)))
  const crossEdges: [SpecSection, SpecSection][] = []
  for (const [a, b] of arrows) {
    const sa = sectionOf(a)
    const sb = sectionOf(b)
    if (sa !== sb && !crossEdges.some(([x, y]) => x === sa && y === sb)) crossEdges.push([sa, sb])
  }

  const ordered = topoOrder(sections, crossEdges, (a, b) => earliest(a) - earliest(b))
  ordered.forEach((sec, i) => {
    sec.index = i + 1
    sec.anchor = slug(`${sec.index}. ${sec.title}`)
    for (const sub of sec.subsections) sub.anchor = slug(`${sec.index}.${sub.index} ${sub.title}`)
  })
  for (const [a, b] of crossEdges) {
    a.leadsTo.push(b)
    b.after.push(a)
  }
  for (const sec of ordered) {
    sec.after.sort((x, y) => x.index - y.index)
    sec.leadsTo.sort((x, y) => x.index - y.index)
  }
  return ordered
}

const link = (s: SpecSection) => `[${s.index}. ${s.title}](#${s.anchor})`

/** Explain only the notation this file actually uses. */
function readingKey(used: {
  subsections: boolean
  sectionWide: boolean
  steps: boolean
  bullets: boolean
  nested: boolean
  forward: boolean
  loops: boolean
}) {
  const parts = [
    used.subsections && 'A `###` heading is a subsection: one part of the section above it, built as part of that section.',
    used.sectionWide && 'Notes listed before a section\'s first subsection apply to the whole section.',
    used.steps && 'Numbered notes are steps, in order.',
    used.bullets && 'Bulleted notes are things to build, in no set order.',
    used.nested &&
      'Notes indented under another note branch off it, and that note names what they belong to: build every branch unless the note says to pick one.',
    used.forward && 'A line starting with `→` means "leads to": the next step, or something that builds on this note.',
    used.loops && '`↺ back to` means the work repeats from an earlier step — a cycle, not a new step.',
  ].filter(Boolean)
  return parts.length ? `**How to read this:** ${parts.join(' ')}` : ''
}

interface Layout {
  pos: Map<string, number>
  childrenOf: Map<string, string[]>
  nested: Set<string>
  /** Top-level notes, in order. */
  top: SpecNote[]
  /** Every top-level note leads to the next one: render as numbered steps. */
  flow: boolean
  /** Arrow ids already expressed by nesting or by step order (not written out). */
  implicit: Set<string>
  nestedArrows: number
  stepArrows: number
}

/**
 * Lay out one section's notes:
 *  - a note with two or more forward arrows to notes that have no other
 *    parent is a fan-out ("Authentication Options" → GitHub / Google /
 *    Email); those targets are nested under it instead of listed twice;
 *  - if every top-level note then leads to the next one, the section is a
 *    flow and is written as numbered steps, so those arrows go without saying.
 */
function layout(notes: SpecNote[], arrows: BoardShape[]): Layout {
  const pos = new Map(notes.map((n, i) => [n.shape.id, i]))
  const inner = arrows.filter((a) => pos.has(String(a.props.from)) && pos.has(String(a.props.to)))
  const forward = (a: BoardShape) => pos.get(String(a.props.to))! > pos.get(String(a.props.from))!
  const parents = new Map<string, number>()
  for (const a of inner) parents.set(String(a.props.to), (parents.get(String(a.props.to)) ?? 0) + 1)

  const childrenOf = new Map<string, string[]>()
  const nested = new Set<string>()
  const implicit = new Set<string>()
  let nestedArrows = 0
  for (const n of notes) {
    const outs = inner.filter((a) => a.props.from === n.shape.id && forward(a))
    const kids = outs.filter((a) => parents.get(String(a.props.to)) === 1 && !nested.has(String(a.props.to)))
    if (outs.length < 2 || kids.length < 2) continue
    kids.sort((x, y) => pos.get(String(x.props.to))! - pos.get(String(y.props.to))!)
    childrenOf.set(n.shape.id, kids.map((a) => String(a.props.to)))
    for (const a of kids) {
      nested.add(String(a.props.to))
      implicit.add(a.id)
      nestedArrows++
    }
  }

  const top = notes.filter((n) => !nested.has(n.shape.id))
  const steps: BoardShape[] = []
  let flow = top.length >= 2
  for (let i = 0; flow && i < top.length - 1; i++) {
    const a = inner.find((x) => x.props.from === top[i].shape.id && x.props.to === top[i + 1].shape.id)
    if (a) steps.push(a)
    else flow = false
  }
  if (flow) for (const a of steps) implicit.add(a.id)
  return { pos, childrenOf, nested, top, flow, implicit, nestedArrows, stepArrows: flow ? steps.length : 0 }
}

const titleLink = (s: SpecSection) => `[${s.title}](#${s.anchor})`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function buildMarkdown(title: string, shapes: BoardShape[], opts: SpecOptions = {}): string {
  const sections = buildSections(shapes, opts)
  const nodeIds = new Set(sections.flatMap((s) => [...s.ids]))
  const byId = new Map(shapes.map((s) => [s.id, s]))
  const arrows = shapes.filter(
    (s) => s.type === 'arrow' && nodeIds.has(String(s.props.from)) && nodeIds.has(String(s.props.to)),
  )
  const sectionOf = (id: string) => sections.find((s) => s.ids.has(id))!
  const noteCount = sections.reduce((n, s) => n + s.noteCount, 0)
  const date = (opts.now ?? new Date()).toISOString().slice(0, 10)
  const headOf = (id: string) => headlineOf(byId.get(id)!)
  /** A section's notes in parts: the section-wide notes (order 0), then each subsection. */
  interface Part {
    sub?: SpecSubsection
    order: number
    L: Layout
  }
  const partsOf = new Map<SpecSection, Part[]>(
    sections.map((s) => [
      s,
      [
        { order: 0, L: layout(s.notes, arrows) },
        ...s.subsections.map((sub) => ({ sub, order: sub.index, L: layout(sub.notes, arrows) })),
      ],
    ]),
  )
  const layouts = [...partsOf.values()].flat().map((p) => p.L)
  const partOfNote = new Map<string, Part>()
  for (const p of [...partsOf.values()].flat()) for (const id of p.L.pos.keys()) partOfNote.set(id, p)
  const subTitles = new Map<string, SpecSubsection>()
  for (const s of sections) for (const sub of s.subsections) if (sub.titleShape) subTitles.set(sub.titleShape.id, sub)
  const subLink = (s: SpecSection, sub: SpecSubsection) => `[${s.index}.${sub.index} ${sub.title}](#${sub.anchor})`

  const out: string[] = []
  out.push(`# ${title.trim() || 'Untitled board'}`, '')
  out.push(
    `_Exported from Co-Create on ${date}. Each section is a group of notes from the board, and each connection is an arrow drawn ` +
      `between two notes. Sections and notes are ordered by their arrows; where there are none, by when they were added._`,
    '',
  )

  if (sections.length === 0) {
    out.push('_The board has no written notes yet._', '')
    return out.join('\n')
  }
  // ── Sections (rendered first, so the key and counts describe what was written) ──
  const body: string[] = []
  let forwardN = 0
  let loopN = 0
  for (const s of sections) {
    const parts = partsOf.get(s)!

    /** One written-out arrow, from its source note's point of view. */
    const arrowInfo = (p: Part, fromPos: number, a: BoardShape): { loop: boolean; text: string } => {
      const toId = String(a.props.to)
      const target = sectionOf(toId)
      if (target === s) {
        if (toId === s.titleShape?.id) return { loop: true, text: `↺ back to: ${s.title}` }
        const subTitle = subTitles.get(toId)
        const tp = subTitle ? undefined : partOfNote.get(toId)
        if (tp === p) {
          const stepNo = new Map(p.L.top.map((n, i) => [n.shape.id, i + 1]))
          // "step 2: …" in a flow.
          const name = p.L.flow && stepNo.has(toId) ? `step ${stepNo.get(toId)}: ${headOf(toId)}` : headOf(toId)
          const loop = p.L.pos.get(toId)! <= fromPos
          return { loop, text: loop ? `↺ back to ${name}` : `→ ${name}` }
        }
        // Another part of this section: link to its subsection heading (or the section for section-wide notes).
        const sub = subTitle ?? tp!.sub
        const where = sub ? subLink(s, sub) : link(s)
        const label = subTitle ? '' : `: ${headOf(toId)}`
        const loop = (sub?.index ?? 0) < p.order
        return { loop, text: loop ? `↺ back to ${where}${label}` : `→ ${where}${label}` }
      }
      const label = toId === target.titleShape?.id ? '' : `: ${headOf(toId)}`
      const loop = target.index < s.index
      return { loop, text: loop ? `↺ back to ${link(target)}${label}` : `→ ${link(target)}${label}` }
    }
    const count = (i: { loop: boolean }) => (i.loop ? loopN++ : forwardN++)

    body.push(`## ${s.index}. ${s.title}`, '')
    if (!s.assigned && sections.length > 1) {
      body.push("_Not named on the board: these notes are grouped because they sat close together._", '')
    }
    const rel: string[] = []
    if (s.after.length) rel.push(`Comes after: ${s.after.map(link).join(', ')}`)
    if (s.leadsTo.length) rel.push(`Leads to: ${s.leadsTo.map(link).join(', ')}`)
    if (rel.length) body.push(`_${rel.join(' · ')}_`, '')
    if (s.intro.length) body.push(...s.intro, '')
    if (s.subsections.length > 1 && s.subsections.every((x) => !x.after.length)) {
      body.push("_No arrows connect its subsections, so they don't depend on each other: build them in any order._", '')
    }

    for (const p of parts) {
      const lines: string[] = []
      const notes = p.sub ? p.sub.notes : s.notes
      const noteById = new Map(notes.map((n) => [n.shape.id, n]))
      const render = (n: SpecNote, pad: string, marker: string) => {
        const written = arrows
          .filter((x) => x.props.from === n.shape.id && !p.L.implicit.has(x.id))
          .map((a) => arrowInfo(p, p.L.pos.get(n.shape.id)!, a))
        written.forEach(count)
        // Loops go on the note's own line so they can't be mistaken for an option or part.
        const loops = written.filter((w) => w.loop).map((w) => w.text)
        lines.push(`${pad}${marker} ${specPrefix(n.shape)}${n.head}${loops.length ? ` (${loops.join('; ')})` : ''}`)
        const inner = pad + ' '.repeat(marker.length + 1)
        for (const item of n.items) lines.push(`${inner}- ${item}`)
        for (const k of p.L.childrenOf.get(n.shape.id) ?? []) render(noteById.get(k)!, inner, '-')
        for (const w of written) if (!w.loop) lines.push(`${inner}- ${w.text}`)
      }
      p.L.top.forEach((n, i) => render(n, '', p.L.flow ? `${i + 1}.` : '-'))

      // Arrows leaving a title (label or box) belong to the section or subsection as a whole.
      const owner = p.sub ? p.sub : s
      if (owner.titleShape) {
        for (const a of arrows.filter((x) => x.props.from === owner.titleShape!.id)) {
          const info = arrowInfo(p, -1, a)
          count(info)
          lines.push(`- ${owner.title} ${info.text}`)
        }
      }

      if (p.sub) {
        body.push(`### ${s.index}.${p.sub.index} ${p.sub.title}`, '')
        if (p.sub.after.length) body.push(`_Comes after: ${p.sub.after.map((x) => subLink(s, x)).join(', ')}_`, '')
        if (!lines.length) lines.push('_No notes yet._')
      }
      if (lines.length) body.push(...lines, '')
    }
    if (body[body.length - 1] !== '') body.push('')
  }

  // ── Key + overview ────────────────────────────────────────────────────
  const nestedN = layouts.reduce((n, l) => n + l.nestedArrows, 0)
  const stepN = layouts.reduce((n, l) => n + l.stepArrows, 0)
  const key = readingKey({
    subsections: sections.some((s) => s.subsections.length),
    sectionWide: sections.some((s) => s.subsections.length && s.notes.length),
    steps: layouts.some((l) => l.flow),
    bullets: layouts.some((l) => !l.flow && l.top.length > 0),
    nested: nestedN > 0,
    forward: forwardN > 0,
    loops: loopN > 0,
  })
  if (key) out.push(key, '')

  out.push('## Overview', '')
  const how = [
    nestedN && `${nestedN} shown by indenting`,
    stepN && `${stepN} by step order`,
    forwardN && `${forwardN} written as →`,
    loopN && `${loopN} as ↺`,
  ].filter(Boolean)
  out.push(
    `${plural(sections.length, 'section')}, ${plural(noteCount, 'note')}, ${plural(arrows.length, 'connection')}` +
      (how.length > 1 ? ` (${how.join(', ')})` : '') +
      '.',
    '',
  )
  // The "Comes after" column only earns its place when some section depends on another.
  const deps = sections.some((s) => s.after.length)
  out.push(deps ? '| # | Section | Notes | Comes after |' : '| # | Section | Notes |', deps ? '|---|---|---|---|' : '|---|---|---|')
  for (const s of sections) {
    const after = s.after.length ? s.after.map((a) => a.index).join(', ') : '—'
    const subs = s.subsections.length ? ` — ${s.subsections.map((x) => subLink(s, x)).join(', ')}` : ''
    out.push(`| ${s.index} | [${s.title}](#${s.anchor})${subs} | ${s.noteCount} |${deps ? ` ${after} |` : ''}`)
  }
  out.push('', ...body)

  // ── Order of work ─────────────────────────────────────────────────────
  out.push('## Order of work', '')
  if (sections.length === 1) {
    out.push(`One section: work through ${titleLink(sections[0])} from top to bottom.`, '')
  } else if (sections.every((s) => !s.after.length)) {
    out.push(
      "No arrows connect the sections, so the board doesn't say that one depends on another: build them in " +
        'any order, or in parallel, unless something in the notes says otherwise.',
      '',
    )
  } else {
    out.push('Build the sections in number order — each one comes after the sections that point to it:', '')
    for (const s of sections) {
      const after = s.after.length ? ` — after ${s.after.map((a) => a.index).join(', ')}` : ' — can start right away'
      out.push(`${s.index}. ${titleLink(s)}${after}`)
    }
    out.push('')
  }
  out.push(...typeSummaries(sections))
  return out.join('\n')
}

export function specFileName(title: string) {
  const base = slug(title).replace(/-+/g, '-').replace(/^-|-$/g, '') || 'board'
  return `${base}.md`
}
