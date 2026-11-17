/** Shape vocabulary, defaults, and geometry helpers for the whiteboard. */

import type { BoardShape, ShapeKind } from './useBoard'

export const STICKY_COLORS = {
  white: { bg: '#FFFFFF', fg: '#000000', label: 'White' },
  gray: { bg: '#EDEDED', fg: '#000000', label: 'Gray' },
  blue: { bg: 'rgba(65, 105, 225, 0.25)', fg: '#000000', label: 'Blue' },
  black: { bg: '#1A1A1A', fg: '#FFFFFF', label: 'Black' },
} as const
export type StickyColor = keyof typeof STICKY_COLORS

export const DEFAULT_SIZE: Record<Exclude<ShapeKind, 'arrow'>, { width: number; height: number }> = {
  sticky: { width: 180, height: 180 },
  box: { width: 220, height: 120 },
  text: { width: 260, height: 48 },
}

export const MIN_SIZE = 40

export function shapeText(s: BoardShape): string {
  return typeof s.props.text === 'string' ? s.props.text : ''
}

export function stickyColor(s: BoardShape): StickyColor {
  const c = s.props.color
  return typeof c === 'string' && c in STICKY_COLORS ? (c as StickyColor) : 'white'
}

/** Point where the ray from a rect's center toward (tx, ty) leaves the rect. */
function edgePoint(s: BoardShape, tx: number, ty: number): [number, number] {
  const cx = s.x + s.width / 2
  const cy = s.y + s.height / 2
  const dx = tx - cx
  const dy = ty - cy
  if (dx === 0 && dy === 0) return [cx, cy]
  const t = Math.min(
    dx === 0 ? Infinity : s.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : s.height / 2 / Math.abs(dy),
  )
  return [cx + dx * t, cy + dy * t]
}

/** Endpoints for an arrow between two shapes, clipped to their borders. */
export function arrowEnds(from: BoardShape, to: BoardShape) {
  const fc: [number, number] = [from.x + from.width / 2, from.y + from.height / 2]
  const tc: [number, number] = [to.x + to.width / 2, to.y + to.height / 2]
  const [x1, y1] = edgePoint(from, tc[0], tc[1])
  const [x2, y2] = edgePoint(to, fc[0], fc[1])
  return { x1, y1, x2, y2 }
}
