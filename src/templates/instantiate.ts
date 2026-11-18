/**
 * Turn a template into shapes for a real board: fresh ids (arrows re-pointed
 * at them), the whole layout moved so it is centred in the view, and creation
 * times one millisecond apart so the export orders notes the way the
 * template lists them (the server stamps its own createdAt on add, so the
 * order rides in props.originalCreatedAt, as it does for a restored version).
 */

import type { BoardShape } from '@/components/board/types'
import type { BoardTemplate } from './templates'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Bounding box of a template's non-arrow shapes (empty template → zero box). */
export function templateBounds(t: BoardTemplate): Bounds {
  const boxes = t.shapes.filter((s) => s.type !== 'arrow')
  if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 }
  const x = Math.min(...boxes.map((s) => s.x))
  const y = Math.min(...boxes.map((s) => s.y))
  return {
    x,
    y,
    width: Math.max(...boxes.map((s) => s.x + s.width)) - x,
    height: Math.max(...boxes.map((s) => s.y + s.height)) - y,
  }
}

/**
 * Room for the board's floating toolbar (top-left) and zoom controls
 * (bottom-right). Templates are sized to fit inside it on a laptop screen, so
 * centring them also keeps them clear of those controls.
 */
export const VIEW_MARGIN = { top: 96, left: 24, bottom: 48, right: 24 }

/**
 * Where to put the template's top-left so it is centred in a `view`-sized
 * viewport whose camera is at the origin (the whiteboard's initial view: one
 * world px per screen px): centred between the margins when it fits there,
 * else centred in the whole view, and if it is bigger than the view, pinned
 * to the top-left margins so the beginning of the template is in view.
 */
export function centredOrigin(bounds: Bounds, view: { width: number; height: number }) {
  const along = (size: number, extent: number, before: number, after: number) => {
    const free = size - before - after
    if (extent <= free) return Math.round(before + (free - extent) / 2)
    return Math.round(extent <= size ? (size - extent) / 2 : before)
  }
  return {
    x: along(view.width, bounds.width, VIEW_MARGIN.left, VIEW_MARGIN.right) - bounds.x,
    y: along(view.height, bounds.height, VIEW_MARGIN.top, VIEW_MARGIN.bottom) - bounds.y,
  }
}

export interface InstantiateOptions {
  /** Offset added to every template coordinate (see centredOrigin). */
  origin: { x: number; y: number }
  now?: Date
  newId?: () => string
}

const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

/** Shapes to add, notes before arrows (an arrow's endpoints must exist first). */
export function instantiateTemplate(t: BoardTemplate, opts: InstantiateOptions): Partial<BoardShape>[] {
  const newId = opts.newId ?? randomId
  const start = (opts.now ?? new Date()).getTime()
  const ids = new Map(t.shapes.map((s) => [s.key, newId()]))
  const ordered = [...t.shapes.filter((s) => s.type !== 'arrow'), ...t.shapes.filter((s) => s.type === 'arrow')]
  return ordered.map((s, i) => {
    const props: Record<string, unknown> = { ...s.props, originalCreatedAt: new Date(start + i).toISOString() }
    if (s.type === 'arrow') {
      props.from = ids.get(String(s.props.from))
      props.to = ids.get(String(s.props.to))
      return { id: ids.get(s.key)!, type: 'arrow', x: 0, y: 0, width: 0, height: 0, props }
    }
    return {
      id: ids.get(s.key)!,
      type: s.type,
      x: s.x + opts.origin.x,
      y: s.y + opts.origin.y,
      width: s.width,
      height: s.height,
      props,
    }
  })
}
