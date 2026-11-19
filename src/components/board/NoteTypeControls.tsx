/**
 * Sticky note types on the board: the badge a typed sticky wears (colour +
 * icon + word, so it never relies on colour alone) and the picker in the
 * selection bar. Keyboard: the picker's buttons are ordinary buttons, and Y on
 * the board cycles the selected stickies' type.
 */

import { CircleHelp, Gavel, Lightbulb, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Hint } from './shortcuts'
import { NOTE_TYPES, NOTE_TYPE_ORDER, noteTypeOf, type NoteType } from './noteTypes'
import type { BoardShape } from './types'

export const NOTE_TYPE_ICONS: Record<NoteType, typeof Lightbulb> = {
  idea: Lightbulb,
  question: CircleHelp,
  decision: Gavel,
  risk: TriangleAlert,
}

/** Tab on a typed sticky's top edge. Ideas (the default) wear none. */
export function NoteTypeBadge({ shape }: { shape: BoardShape }) {
  const t = noteTypeOf(shape)
  if (!t || t === 'idea') return null
  const { label, ink, fill } = NOTE_TYPES[t]
  const Icon = NOTE_TYPE_ICONS[t]
  return (
    <span
      aria-hidden // the sticky's accessible name already says its type
      data-testid="note-type-badge"
      data-note-type={t}
      className="pointer-events-none absolute -top-2.5 right-2 flex items-center gap-1 border px-1 font-mono text-[10px] font-bold uppercase leading-4 tracking-[0.05em] text-[#0A0A0A]"
      style={{ background: fill, borderColor: ink }}
    >
      <Icon className="size-3" style={{ color: ink }} />
      {label}
    </span>
  )
}

/** Selection-bar control: set the type of every selected sticky. */
export function NoteTypePicker({ shapes, onPick }: { shapes: BoardShape[]; onPick: (t: NoteType) => void }) {
  const stickies = shapes.filter((s) => s.type === 'sticky')
  if (!stickies.length) return null
  const types = new Set(stickies.map((s) => noteTypeOf(s)))
  const current = types.size === 1 ? [...types][0] : null
  return (
    <div role="group" aria-label="Sticky note type" data-testid="note-type-picker" className="flex items-center">
      {NOTE_TYPE_ORDER.map((t) => {
        const Icon = NOTE_TYPE_ICONS[t]
        const { label, ink, fill } = NOTE_TYPES[t]
        const on = current === t
        return (
          <Hint key={t} label={`Mark as ${label.toLowerCase()} (Y cycles the type)`} side="top">
            <button
              type="button"
              data-testid={`note-type-${t}`}
              aria-label={label}
              aria-pressed={on}
              onClick={() => onPick(t)}
              className={cn(
                'flex size-8 items-center justify-center border border-foreground -ml-px first:ml-0',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                on ? 'text-[#0A0A0A]' : 'bg-background hover:bg-royal/20',
              )}
              style={on ? { background: fill, boxShadow: `inset 0 -3px 0 ${ink}` } : undefined}
            >
              <Icon className="size-4" style={{ color: ink }} aria-hidden />
            </button>
          </Hint>
        )
      })}
    </div>
  )
}
