/**
 * Sticky note types: idea (the default), question, decision, risk. Stored as
 * `props.noteType` on a sticky. Each type has a colour AND a label (and an
 * icon on the board), so the type never relies on colour alone; it is also
 * part of the note's accessible name and of the exported spec.
 * Pure (no React), so the spec builder and tests can use it.
 */

import type { BoardShape } from './types'

export type NoteType = 'idea' | 'question' | 'decision' | 'risk'

export const NOTE_TYPE_ORDER: NoteType[] = ['idea', 'question', 'decision', 'risk']

export const NOTE_TYPES: Record<NoteType, { label: string; summary: string; ink: string; fill: string }> = {
  idea: { label: 'Idea', summary: 'Ideas', ink: '#0A0A0A', fill: '#FFFFFF' },
  question: { label: 'Question', summary: 'Open questions', ink: '#4169E1', fill: '#DCE4FA' },
  decision: { label: 'Decision', summary: 'Decisions', ink: '#1E8E3E', fill: '#E1F3E6' },
  risk: { label: 'Risk', summary: 'Risks', ink: '#D93025', fill: '#FBE3E1' },
}

const isNoteType = (v: unknown): v is NoteType => typeof v === 'string' && v in NOTE_TYPES

/** A sticky's type ('idea' when unset or unknown); null for other shapes. */
export function noteTypeOf(s: Pick<BoardShape, 'type' | 'props'>): NoteType | null {
  if (s.type !== 'sticky') return null
  return isNoteType(s.props.noteType) ? s.props.noteType : 'idea'
}

/** The type after `t`, wrapping around (keyboard: Y cycles). */
export function nextNoteType(t: NoteType): NoteType {
  return NOTE_TYPE_ORDER[(NOTE_TYPE_ORDER.indexOf(t) + 1) % NOTE_TYPE_ORDER.length]
}

/**
 * The type a group of stickies cycles to: one past their shared type, or the
 * first non-default type when they differ.
 */
export function cycleNoteType(stickies: Pick<BoardShape, 'type' | 'props'>[]): NoteType {
  const types = new Set(stickies.map((s) => noteTypeOf(s) ?? 'idea'))
  return types.size === 1 ? nextNoteType([...types][0]) : 'question'
}

/** "Sticky note" for an idea (the default), "Question sticky note" etc. otherwise. */
export function stickyKindName(s: Pick<BoardShape, 'type' | 'props'>): string {
  const t = noteTypeOf(s)
  return !t || t === 'idea' ? 'Sticky note' : `${NOTE_TYPES[t].label} sticky note`
}

/** Spec prefix for a note: "**Question:** " (none for ideas and non-stickies). */
export function specPrefix(s: Pick<BoardShape, 'type' | 'props'>): string {
  const t = noteTypeOf(s)
  return t && t !== 'idea' ? `**${NOTE_TYPES[t].label}:** ` : ''
}
