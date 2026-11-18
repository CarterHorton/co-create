/**
 * Keyboard and screen-reader helpers for the whiteboard: the order Tab visits
 * shapes in, what each shape is called, and keeping a shape on screen.
 * Pure functions, so they're unit-tested without a DOM.
 */

import type { BoardShape } from './types'

const KIND_NAMES: Record<string, string> = { sticky: 'Sticky note', box: 'Box', text: 'Text', arrow: 'Arrow' }

/** Shape text without line breaks, shortened for a label. */
function shortText(s: BoardShape, max = 80): string {
  const text = String(s.props.text ?? '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** "Sticky note", "Box", … */
export function kindName(s: Pick<BoardShape, 'type'>): string {
  return KIND_NAMES[s.type] ?? 'Shape'
}

/** How an arrow end is named: its text, or its kind when it has none. */
function endName(s: BoardShape | undefined): string {
  if (!s) return 'a missing shape'
  const text = shortText(s, 40)
  return text ? `“${text}”` : `a ${kindName(s).toLowerCase()}`
}

/**
 * The accessible name of a shape: "Sticky note: Buy milk", "Box (empty)",
 * "Arrow from “Login” to “Home”".
 */
export function shapeName(s: BoardShape, byId: Map<string, BoardShape>): string {
  if (s.type === 'arrow') {
    return `Arrow from ${endName(byId.get(String(s.props.from)))} to ${endName(byId.get(String(s.props.to)))}`
  }
  const text = shortText(s)
  return text ? `${kindName(s)}: ${text}` : `${kindName(s)} (empty)`
}

/**
 * Reading order for Tab: top to bottom, then left to right. Shapes whose tops
 * are within `rowTolerance` of the first shape in a row count as one row, so a
 * row of notes that isn't pixel-aligned still reads left to right. Arrows come
 * after every note, in the order of the shapes they start from.
 */
export function readingOrder(shapes: BoardShape[], rowTolerance = 40): BoardShape[] {
  const notes = shapes.filter((s) => s.type !== 'arrow')
  const byTop = [...notes].sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: BoardShape[][] = []
  for (const s of byTop) {
    const row = rows[rows.length - 1]
    if (row && s.y - row[0].y <= rowTolerance) row.push(s)
    else rows.push([s])
  }
  const ordered = rows.flatMap((row) => row.sort((a, b) => a.x - b.x || a.y - b.y))
  const rank = new Map(ordered.map((s, i) => [s.id, i]))
  const arrows = shapes
    .filter((s) => s.type === 'arrow')
    .map((a, i) => ({ a, i, from: rank.get(String(a.props.from)) ?? Infinity, to: rank.get(String(a.props.to)) ?? Infinity }))
    .sort((p, q) => p.from - q.from || p.to - q.to || p.i - q.i)
    .map((p) => p.a)
  return [...ordered, ...arrows]
}

export interface Camera {
  x: number
  y: number
  zoom: number
}

/**
 * The smallest camera pan that brings a world-space rectangle fully on screen
 * (with `margin` px to spare). Returns the same camera when it's already
 * visible. A rectangle larger than the view is aligned to its top-left.
 */
export function panToShow(
  cam: Camera,
  rect: { x: number; y: number; width: number; height: number },
  view: { width: number; height: number },
  margin = 48,
): Camera {
  if (!view.width || !view.height) return cam
  const axis = (pos: number, size: number, offset: number, viewSize: number) => {
    const start = offset + pos * cam.zoom
    const end = start + size * cam.zoom
    if (start < margin) return offset + (margin - start)
    if (end > viewSize - margin) return offset - Math.min(end - (viewSize - margin), start - margin)
    return offset
  }
  const x = axis(rect.x, rect.width, cam.x, view.width)
  const y = axis(rect.y, rect.height, cam.y, view.height)
  return x === cam.x && y === cam.y ? cam : { ...cam, x, y }
}
