/**
 * Frames: named rectangles drawn behind the other shapes. A shape fully
 * inside a frame belongs to it: it moves with the frame, and the Markdown
 * export lists it in a section titled with the frame's name.
 * Pure functions, unit-tested without a DOM.
 */

import type { BoardShape } from './types'

export const isFrame = (s: Pick<BoardShape, 'type'>) => s.type === 'frame'

/** Shown (and exported) for a frame nobody has named. */
export const UNTITLED_FRAME = 'Untitled frame'

type Rect = Pick<BoardShape, 'x' | 'y' | 'width' | 'height'>

/** `inner` lies entirely within `outer` (edges may touch). */
export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

/** The frame's name on one line, or '' when unnamed. */
export function frameName(frame: BoardShape): string {
  return typeof frame.props.text === 'string' ? frame.props.text.replace(/\s+/g, ' ').trim() : ''
}

/** Shapes (not arrows) fully inside a frame, other than the frame itself. */
export function frameContents(frame: BoardShape, shapes: Iterable<BoardShape>): BoardShape[] {
  const out: BoardShape[] = []
  for (const s of shapes) if (s.id !== frame.id && s.type !== 'arrow' && contains(frame, s)) out.push(s)
  return out
}

/**
 * The shapes a move acts on: `targets` plus everything fully inside any
 * frame among them (so dragging a frame carries its contents). No duplicates.
 */
export function withFrameContents(targets: BoardShape[], shapes: BoardShape[]): BoardShape[] {
  const out = new Map(targets.map((t) => [t.id, t]))
  for (const f of targets) {
    if (!isFrame(f)) continue
    for (const s of frameContents(f, shapes)) if (!out.has(s.id)) out.set(s.id, s)
  }
  return [...out.values()]
}

/**
 * Each non-frame, non-arrow shape → the innermost (smallest) frame that fully
 * contains it. Shapes outside every frame are absent.
 */
export function frameMembership(shapes: BoardShape[]): Map<string, BoardShape> {
  const frames = shapes.filter(isFrame).sort((a, b) => a.width * a.height - b.width * b.height || a.id.localeCompare(b.id))
  const out = new Map<string, BoardShape>()
  if (!frames.length) return out
  for (const s of shapes) {
    if (s.type === 'arrow' || isFrame(s)) continue
    const f = frames.find((x) => contains(x, s))
    if (f) out.set(s.id, f)
  }
  return out
}

/** Accessible name: "Frame: Login page, 4 items", "Frame (untitled), empty". */
export function frameLabel(frame: BoardShape, shapes: Iterable<BoardShape>): string {
  const name = frameName(frame)
  const n = frameContents(frame, shapes).length
  const count = n === 0 ? 'empty' : `${n} ${n === 1 ? 'item' : 'items'}`
  return `${name ? `Frame: ${name}` : 'Frame (untitled)'}, ${count}`
}

/**
 * Board styling. A frame sits behind arrows and shapes (negative z-index in
 * the world layer) and ignores the pointer except on its title tab and resize
 * handle, so clicks inside it reach the canvas (box-select, double-click to
 * add a sticky) and the shapes on it.
 */
export const FRAME_CLASS =
  '-z-10 pointer-events-none items-start border-2 border-dashed border-foreground/60 bg-foreground/[0.02]'
export const FRAME_TITLE_CLASS =
  'pointer-events-auto w-auto max-w-full truncate whitespace-nowrap bg-foreground px-2 py-1 text-sm font-bold text-background'
export const FRAME_EDITOR_CLASS = 'pointer-events-auto h-8 bg-background px-2 py-1 text-sm font-bold text-foreground'