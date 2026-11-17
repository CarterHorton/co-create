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

export interface SpecOptions {
  /** Max distance (canvas px) between two notes' edges to group them. */
  gap?: number
  /** Export timestamp; injectable for tests. */
  now?: Date
}

export interface SpecNote {
  shape: BoardShape
  text: string
}

export interface SpecSection {
  index: number
  title: string
  anchor: string
  /** Shape whose text became the title, if any. */
  titleShape?: BoardShape
  /** Extra lines from a note whose first line became the title. */
  intro: string[]
  notes: SpecNote[]
  /** Notes in the section, counting a note whose first line became the title (not a text/box label). */
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
/** Section name a user assigned to this shape, or ''. */
export const sectionNameOf = (s: BoardShape) => (typeof s.props.section === 'string' ? s.props.section.trim() : '')
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
  const nodes = shapes.filter((s) => s.type !== 'arrow' && textOf(s))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const arrows = shapes
    .filter((s) => s.type === 'arrow')
    .map((a) => [byId.get(String(a.props.from)), byId.get(String(a.props.to))] as const)
    .filter((e): e is readonly [BoardShape, BoardShape] => !!e[0] && !!e[1] && e[0] !== e[1])

  // Named sections first (case-insensitive; the first spelling wins), then proximity for the rest.
  const named = new Map<string, { name: string; shapes: BoardShape[] }>()
  for (const n of [...nodes].sort(byTime)) {
    const name = sectionNameOf(n)
    if (!name) continue
    const key = name.toLowerCase()
    if (!named.has(key)) named.set(key, { name, shapes: [] })
    named.get(key)!.shapes.push(n)
  }
  const groups: { name?: string; shapes: BoardShape[] }[] = [
    ...named.values(),
    ...clusterByProximity(
      nodes.filter((n) => !sectionNameOf(n)),
      opts.gap ?? DEFAULT_GAP,
    ).map((shapes) => ({ shapes })),
  ]

  const sections: SpecSection[] = groups.map(({ name, shapes: group }) => {
    group = [...group].sort(byTime)
    const label = name ? undefined : (group.find((s) => s.type === 'text') ?? group.find((s) => s.type === 'box'))
    let title: string
    let intro: string[] = []
    let titleShape: BoardShape | undefined
    let rest = group
    if (name) {
      title = name
    } else if (label) {
      titleShape = label
      title = textOf(label).split('\n')[0]
      rest = group.filter((s) => s !== label)
    } else {
      const [first, ...more] = textOf(group[0]).split('\n')
      titleShape = group[0]
      title = first.length > 80 ? `${first.slice(0, 77)}…` : first
      intro = first.length > 80 ? [first, ...more] : more
      rest = group.slice(1)
    }
    const ids = new Set(group.map((s) => s.id))
    const inner = arrows.filter(([a, b]) => rest.includes(a) && rest.includes(b)) as [BoardShape, BoardShape][]
    const notes = topoOrder(rest, inner, byTime).map((shape) => ({ shape, text: textOf(shape) }))
    const noteCount = notes.length + (name || label ? 0 : 1)
    return { index: 0, title, anchor: '', titleShape, intro, notes, noteCount, assigned: !!name, ids, after: [], leadsTo: [] }
  })

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
const firstLine = (t: string) => t.split('\n')[0]

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

  const out: string[] = []
  out.push(`# ${title.trim() || 'Untitled board'}`, '')
  out.push(
    `_Exported from Co-Create on ${date}. Each section is either a group you named on the board or a group of notes ` +
      `that sat close together. ` +
      `Sections and notes are ordered by their arrows, then by when they were added._`,
    '',
  )

  if (sections.length === 0) {
    out.push('_The board has no written notes yet._', '')
    return out.join('\n')
  }

  out.push('## Overview', '')
  out.push(`${sections.length} section${sections.length === 1 ? '' : 's'}, ${noteCount} note${noteCount === 1 ? '' : 's'}, ${arrows.length} connection${arrows.length === 1 ? '' : 's'}.`, '')
  out.push('| # | Section | Notes | Comes after |', '|---|---|---|---|')
  for (const s of sections) {
    const after = s.after.length ? s.after.map((a) => a.index).join(', ') : '—'
    out.push(`| ${s.index} | [${s.title}](#${s.anchor}) | ${s.noteCount} | ${after} |`)
  }
  out.push('')

  for (const s of sections) {
    out.push(`## ${s.index}. ${s.title}`, '')
    const rel: string[] = []
    if (s.after.length) rel.push(`Comes after: ${s.after.map(link).join(', ')}`)
    if (s.leadsTo.length) rel.push(`Leads to: ${s.leadsTo.map(link).join(', ')}`)
    if (rel.length) out.push(`_${rel.join(' · ')}_`, '')
    if (s.intro.length) out.push(...s.intro, '')

    for (const n of s.notes) {
      const [head, ...more] = n.text.split('\n')
      out.push(`- ${head}`)
      for (const line of more) if (line.trim()) out.push(`  ${line}`)
      for (const a of arrows.filter((x) => x.props.from === n.shape.id)) {
        const to = byId.get(String(a.props.to))!
        const target = sectionOf(to.id)
        if (target === s) {
          out.push(`  - → ${to === s.titleShape ? s.title : firstLine(textOf(to))}`)
        } else {
          const label = to === target.titleShape ? '' : `: ${firstLine(textOf(to))}`
          out.push(`  - → ${link(target)}${label}`)
        }
      }
    }
    // Arrows leaving from the section's title shape belong to the section as a whole.
    if (s.titleShape) {
      for (const a of arrows.filter((x) => x.props.from === s.titleShape!.id)) {
        const to = byId.get(String(a.props.to))!
        const target = sectionOf(to.id)
        const label = target === s || to === target.titleShape ? '' : `: ${firstLine(textOf(to))}`
        if (target === s) out.push(`- ${s.title} → ${firstLine(textOf(to))}`)
        else out.push(`- ${s.title} → ${link(target)}${label}`)
      }
    }
    if (s.notes.length || s.intro.length || s.titleShape) out.push('')
  }

  out.push('## Suggested order of work', '')
  for (const s of sections) {
    out.push(`- [ ] ${s.index}. ${s.title} (${s.noteCount} note${s.noteCount === 1 ? '' : 's'})`)
  }
  out.push('')
  return out.join('\n')
}

export function specFileName(title: string) {
  const base = slug(title).replace(/-+/g, '-').replace(/^-|-$/g, '') || 'board'
  return `${base}.md`
}
