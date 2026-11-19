/**
 * Relations (arrows between two entity tables): the end labels drawn on the
 * board ("1" / "∗" next to each table) and the floating bar that sets the
 * cardinality of the selected relation.
 */

import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { CARDINALITIES, cardinalityInfo, cardinalityOf, type Cardinality } from '@/spec/dataModel'
import type { BoardShape } from './types'
import { endLabelPoint, pathStart, type Pt } from './relation'

const center = (s: BoardShape) => ({ x: s.x + s.width / 2, y: s.y + s.height / 2 })

/** The "1" / "∗" labels at each end of a relation (decorative: the arrow's name says it). */
export function RelationEnds({ arrow, from, to, d, tip }: { arrow: BoardShape; from: BoardShape; to: BoardShape; d: string; tip: Pt }) {
  const start = pathStart(d)
  if (!start) return null
  const [a, b] = cardinalityInfo(cardinalityOf(arrow)).ends
  const ends: [string, Pt][] = [
    [a, endLabelPoint(from, start)],
    [b, endLabelPoint(to, tip)],
  ]
  return (
    <g aria-hidden pointerEvents="none">
      {ends.map(([text, p], i) => (
        <text
          key={i}
          data-testid="relation-end"
          x={p.x}
          y={p.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={15}
          fontWeight={700}
          fontFamily="'JetBrains Mono', monospace"
          fill="#000"
          stroke="#fff"
          strokeWidth={4}
          paintOrder="stroke"
        >
          {text}
        </text>
      ))}
    </g>
  )
}

/** Keep the bar below the toolbar row. */
const BAR_MIN_TOP = 72

/**
 * Cardinality picker for the selected relation, floating by the middle of the
 * arrow. Escape returns focus to the arrow.
 */
export function RelationBar({
  arrow,
  from,
  to,
  cam,
  view,
  onChange,
  onEscape,
}: {
  arrow: BoardShape
  from: BoardShape
  to: BoardShape
  cam: { x: number; y: number; zoom: number }
  view: { width: number; height: number }
  onChange: (c: Cardinality) => void
  onEscape: () => void
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = barRef.current
    if (!el) return
    const measure = () => setSize({ width: el.offsetWidth, height: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const a = center(from)
  const b = center(to)
  const mid = { x: cam.x + ((a.x + b.x) / 2) * cam.zoom, y: cam.y + ((a.y + b.y) / 2) * cam.zoom }
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)))
  const left = clamp(mid.x - size.width / 2, 16, view.width - size.width - 16)
  const top = clamp(mid.y + 24, BAR_MIN_TOP, view.height - size.height - 16)
  const current = cardinalityOf(arrow)

  return (
    <div
      ref={barRef}
      data-testid="relation-bar"
      role="group"
      aria-label="Relation cardinality"
      className="absolute z-20 flex items-center gap-1 border border-foreground bg-background p-1.5 shadow-[4px_4px_0_0_#000]"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onEscape()
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          // Arrow keys move between the options, like a toolbar.
          e.preventDefault()
          const buttons = [...(barRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
          const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
          buttons[(i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
        } else if (e.key !== 'Tab') {
          e.stopPropagation() // keep board shortcuts (Delete, Space-to-pan, tool keys) off the board behind
        }
      }}
    >
      <span className="whitespace-nowrap px-1.5 font-mono text-xs font-semibold">Relation</span>
      {CARDINALITIES.map((c) => (
        <button
          key={c.id}
          type="button"
          data-testid={`cardinality-${c.id}`}
          aria-label={c.label}
          aria-pressed={current === c.id}
          onClick={() => onChange(c.id)}
          className={cn(
            'h-8 border border-foreground px-2 font-mono text-xs font-bold',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            current === c.id ? 'bg-foreground text-background' : 'hover:bg-royal/20',
          )}
        >
          {c.short}
        </button>
      ))}
    </div>
  )
}
