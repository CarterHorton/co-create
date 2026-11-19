/** Geometry for relation end labels (pure, shared by the board and the PDF). */

import type { BoardShape } from './types'

export type Pt = { x: number; y: number }
const center = (s: BoardShape): Pt => ({ x: s.x + s.width / 2, y: s.y + s.height / 2 })

/** Where an end label sits: just off the shape's edge where the line meets it, beside the line. */
export function endLabelPoint(shape: BoardShape, edge: Pt, offset = 14): Pt {
  const c = center(shape)
  let dx = edge.x - c.x
  let dy = edge.y - c.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) {
    dx = 0
    dy = -1
  } else {
    dx /= len
    dy /= len
  }
  // Out from the edge, then to one side so the label doesn't sit on the line.
  return { x: edge.x + dx * offset - dy * offset * 0.8, y: edge.y + dy * offset + dx * offset * 0.8 }
}

/** First point of an SVG path ("M x y …"). */
export function pathStart(d: string): Pt | null {
  const m = /^\s*M\s*(-?[\d.]+(?:e-?\d+)?)[\s,]+(-?[\d.]+(?:e-?\d+)?)/i.exec(d)
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null
}
