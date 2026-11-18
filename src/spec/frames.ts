/**
 * Spec rules for frames and sticky note types (used by buildSpec.ts).
 *
 *  - Which section a note joins: its explicit `props.section` first, then the
 *    innermost frame it sits fully inside, else none (proximity grouping).
 *    A named frame is a section of that name (merging with a section assigned
 *    the same name); an unnamed frame is a section of its own, "Untitled frame".
 *    A frame is its own section's title, so arrows to and from a frame
 *    connect its section like arrows from a section's label do.
 *  - Typed notes (question, decision, risk) are prefixed in their sections and
 *    gathered into summary lists at the end of the spec.
 */

import type { BoardShape } from '@/components/board/types'
import { UNTITLED_FRAME, frameName, isFrame } from '@/components/board/frame'
import { NOTE_TYPES, noteTypeOf, type NoteType } from '@/components/board/noteTypes'
import type { SpecNote, SpecSection } from './buildSpec'

export interface SectionKey {
  /** Grouping key (case-insensitive name, or a frame's own id when it has no name). */
  key: string
  /** The section's title. */
  name: string
}

const explicit = (s: BoardShape) => (typeof s.props.section === 'string' ? s.props.section.trim() : '')

/**
 * The named section a shape belongs to, or null to group it by proximity.
 * Precedence: explicit section > frame > none. A frame heads its own section
 * (its own `props.section` is ignored).
 */
export function sectionKeyOf(s: BoardShape, frameOf: Map<string, BoardShape>): SectionKey | null {
  if (isFrame(s)) return frameKey(s)
  const name = explicit(s)
  if (name) return { key: name.toLowerCase(), name }
  const f = frameOf.get(s.id)
  return f ? frameKey(f) : null
}

function frameKey(f: BoardShape): SectionKey {
  const name = frameName(f)
  return name ? { key: name.toLowerCase(), name } : { key: `\u0000frame:${f.id}`, name: UNTITLED_FRAME }
}

/** Typed notes summarised at the end, in this order. Ideas aren't listed. */
const SUMMARY_TYPES: NoteType[] = ['question', 'decision', 'risk']

/**
 * "## Open questions", "## Decisions", "## Risks": each typed note with a link
 * to its section, in section order. Empty lists are left out.
 */
export function typeSummaries(sections: SpecSection[]): string[] {
  const found = new Map<NoteType, string[]>(SUMMARY_TYPES.map((t) => [t, []]))
  for (const s of sections) {
    const link = `[${s.index}. ${s.title}](#${s.anchor})`
    const notes: { shape: BoardShape; head: string }[] = []
    // A note whose first line became the section title still counts.
    if (s.titleShape?.type === 'sticky') notes.push({ shape: s.titleShape, head: s.title })
    const add = (list: SpecNote[]) => notes.push(...list)
    add(s.notes)
    for (const sub of s.subsections) add(sub.notes)
    for (const n of notes) {
      const t = noteTypeOf(n.shape)
      if (t && found.has(t)) found.get(t)!.push(`- ${n.head} — ${link}`)
    }
  }
  const out: string[] = []
  for (const t of SUMMARY_TYPES) {
    const lines = found.get(t)!
    if (lines.length) out.push(`## ${NOTE_TYPES[t].summary}`, '', ...lines, '')
  }
  return out
}
