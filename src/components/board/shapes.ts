/** Shape vocabulary, defaults, and geometry helpers for the whiteboard. */

import type { ArrowRoute, BoardShape, ShapeKind } from './types'

export const STICKY_COLORS = {
  white: { bg: '#FFFFFF', fg: '#000000', label: 'White' },
  gray: { bg: '#EDEDED', fg: '#000000', label: 'Gray' },
  blue: { bg: 'rgba(65, 105, 225, 0.25)', fg: '#000000', label: 'Blue' },
  black: { bg: '#1A1A1A', fg: '#FFFFFF', label: 'Black' },
} as const
export type StickyColor = keyof typeof STICKY_COLORS

/**
 * Text, box fill and box border colors, picked from the selection bar.
 * Stored by name in props (textColor / fill / stroke) so the palette can be
 * retuned without migrating boards; unknown names fall back to the default.
 */
export const INK_COLORS = {
  black: { value: '#0A0A0A', label: 'Black' },
  gray: { value: '#6B6B6B', label: 'Gray' },
  blue: { value: '#4169E1', label: 'Blue' },
  red: { value: '#D93025', label: 'Red' },
  green: { value: '#1E8E3E', label: 'Green' },
  orange: { value: '#E8710A', label: 'Orange' },
  purple: { value: '#8E44AD', label: 'Purple' },
  white: { value: '#FFFFFF', label: 'White' },
} as const
export type InkColor = keyof typeof INK_COLORS

export const FILL_COLORS = {
  white: { value: '#FFFFFF', label: 'White', dark: false },
  gray: { value: '#EDEDED', label: 'Gray', dark: false },
  blue: { value: '#DCE4FA', label: 'Blue', dark: false },
  red: { value: '#FBE3E1', label: 'Red', dark: false },
  green: { value: '#E1F3E6', label: 'Green', dark: false },
  orange: { value: '#FDEBD8', label: 'Orange', dark: false },
  purple: { value: '#EFE3F6', label: 'Purple', dark: false },
  black: { value: '#1A1A1A', label: 'Black', dark: true },
} as const
export type FillColor = keyof typeof FILL_COLORS

const pick = <T extends object>(table: T, v: unknown): keyof T | null =>
  typeof v === 'string' && v in table ? (v as keyof T) : null

/** The shape's chosen text color name, or null for its default. */
export const textColorOf = (s: BoardShape) => pick(INK_COLORS, s.props.textColor)
/** A box's chosen fill name, or null (the page background). */
export const fillOf = (s: BoardShape) => (s.type === 'box' ? pick(FILL_COLORS, s.props.fill) : null)
/** A box's chosen border name, or null (black). */
export const strokeOf = (s: BoardShape) => (s.type === 'box' ? pick(INK_COLORS, s.props.stroke) : null)

/** Resolved colors for rendering a shape (undefined = the stylesheet default). */
export function shapeColors(s: BoardShape): { background?: string; color?: string; borderColor?: string } {
  const sticky = s.type === 'sticky' ? STICKY_COLORS[stickyColor(s)] : null
  const fill = fillOf(s)
  const text = textColorOf(s)
  const stroke = strokeOf(s)
  return {
    background: sticky?.bg ?? (fill ? FILL_COLORS[fill].value : undefined),
    // A dark box fill flips the default text to white, like a black sticky.
    color: text ? INK_COLORS[text].value : (sticky?.fg ?? (fill && FILL_COLORS[fill].dark ? '#FFFFFF' : undefined)),
    borderColor: stroke ? INK_COLORS[stroke].value : undefined,
  }
}

export const DEFAULT_SIZE: Record<Exclude<ShapeKind, 'arrow'>, { width: number; height: number }> = {
  sticky: { width: 180, height: 180 },
  box: { width: 220, height: 120 },
  text: { width: 260, height: 48 },
}

export const MIN_SIZE = 40

export const ARROW_ROUTES: { id: ArrowRoute; label: string }[] = [
  { id: 'straight', label: 'Straight' },
  { id: 'elbow', label: 'Elbow' },
  { id: 'curve', label: 'Curve' },
]

export function shapeText(s: BoardShape): string {
  return typeof s.props.text === 'string' ? s.props.text : ''
}

export function stickyColor(s: BoardShape): StickyColor {
  const c = s.props.color
  return typeof c === 'string' && c in STICKY_COLORS ? (c as StickyColor) : 'white'
}

export function arrowRoute(s: BoardShape): ArrowRoute {
  const r = s.props.route
  return r === 'elbow' || r === 'curve' ? r : 'straight'
}

type Pt = { x: number; y: number }
const center = (s: BoardShape): Pt => ({ x: s.x + s.width / 2, y: s.y + s.height / 2 })

/** Point where the ray from a rect's center toward `t` leaves the rect. */
function edgePoint(s: BoardShape, t: Pt): Pt {
  const c = center(s)
  const dx = t.x - c.x
  const dy = t.y - c.y
  if (dx === 0 && dy === 0) return c
  const k = Math.min(
    dx === 0 ? Infinity : s.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : s.height / 2 / Math.abs(dy),
  )
  return { x: c.x + dx * k, y: c.y + dy * k }
}

/** Default curve bend: a gentle arc to the left of the from→to direction. */
function defaultBend(from: BoardShape, to: BoardShape): Pt {
  const a = center(from)
  const b = center(to)
  const dx = b.x - a.x
  const dy = b.y - a.y
  return { x: dy * 0.2, y: -dx * 0.2 }
}

/** The arrow's bend offset as stored, or the route's default. */
export function arrowBend(arrow: BoardShape, from: BoardShape, to: BoardShape): Pt {
  const b = arrow.props.bend as Partial<Pt> | undefined
  if (b && typeof b.x === 'number' && typeof b.y === 'number') return { x: b.x, y: b.y }
  return arrowRoute(arrow) === 'curve' ? defaultBend(from, to) : { x: 0, y: 0 }
}

export interface ArrowGeometry {
  /** SVG path data. */
  d: string
  /** Drag handle that reshapes the arrow; absent for straight arrows. */
  handle?: Pt
  /** Which handle axes move it ('x' = elbow column, 'y' = elbow row, 'xy' = curve). */
  axis?: 'x' | 'y' | 'xy'
  /** Where the arrowhead sits, and a point its last segment comes from (for drawing the head). */
  tip: Pt
  tail: Pt
}

export function arrowGeometry(
  from: BoardShape,
  to: BoardShape,
  route: ArrowRoute,
  bend: Pt = { x: 0, y: 0 },
): ArrowGeometry {
  const fc = center(from)
  const tc = center(to)

  if (route === 'curve') {
    const h = { x: (fc.x + tc.x) / 2 + bend.x, y: (fc.y + tc.y) / 2 + bend.y }
    const p0 = edgePoint(from, h)
    const p2 = edgePoint(to, h)
    // Control point chosen so the quadratic passes through h at t = 0.5.
    const c = { x: 2 * h.x - (p0.x + p2.x) / 2, y: 2 * h.y - (p0.y + p2.y) / 2 }
    return { d: `M ${p0.x} ${p0.y} Q ${c.x} ${c.y} ${p2.x} ${p2.y}`, handle: h, axis: 'xy', tip: p2, tail: c }
  }

  if (route === 'elbow') {
    const horizontal = Math.abs(tc.x - fc.x) >= Math.abs(tc.y - fc.y)
    if (horizontal) {
      const midX = (fc.x + tc.x) / 2 + bend.x
      const sx = midX >= fc.x ? from.x + from.width : from.x
      const ex = midX <= tc.x ? to.x : to.x + to.width
      return {
        d: `M ${sx} ${fc.y} H ${midX} V ${tc.y} H ${ex}`,
        handle: { x: midX, y: (fc.y + tc.y) / 2 },
        axis: 'x',
        tip: { x: ex, y: tc.y },
        tail: { x: midX, y: tc.y },
      }
    }
    const midY = (fc.y + tc.y) / 2 + bend.y
    const sy = midY >= fc.y ? from.y + from.height : from.y
    const ey = midY <= tc.y ? to.y : to.y + to.height
    return {
      d: `M ${fc.x} ${sy} V ${midY} H ${tc.x} V ${ey}`,
      handle: { x: (fc.x + tc.x) / 2, y: midY },
      axis: 'y',
      tip: { x: tc.x, y: ey },
      tail: { x: tc.x, y: midY },
    }
  }

  const p0 = edgePoint(from, tc)
  const p2 = edgePoint(to, fc)
  return { d: `M ${p0.x} ${p0.y} L ${p2.x} ${p2.y}`, tip: p2, tail: p0 }
}
