/** Shape vocabulary, defaults, and geometry helpers for the whiteboard. */

import type { ArrowRoute, BoardShape, ShapeKind } from './types'
import { DEFAULT_ENTITY_SIZE } from '@/spec/dataModel'

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
  frame: { width: 480, height: 320 },
  entity: DEFAULT_ENTITY_SIZE,
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

/** A side of a box an elbow arrow can leave from or enter at. */
export type Side = 'top' | 'right' | 'bottom' | 'left'
export const SIDES: Side[] = ['top', 'right', 'bottom', 'left']
export interface ArrowSides {
  from?: Side
  to?: Side
}

const isSide = (v: unknown): v is Side => typeof v === 'string' && (SIDES as string[]).includes(v)

/** The sides an elbow arrow was pinned to (props.fromSide / props.toSide); unset = automatic. */
export function arrowSides(arrow: BoardShape): ArrowSides {
  return {
    from: isSide(arrow.props.fromSide) ? arrow.props.fromSide : undefined,
    to: isSide(arrow.props.toSide) ? arrow.props.toSide : undefined,
  }
}

const NORMAL: Record<Side, Pt> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } }

/** Midpoint of a box's side: where a pinned elbow arrow attaches. */
export function sidePoint(s: BoardShape, side: Side): Pt {
  const c = center(s)
  return { x: c.x + NORMAL[side].x * (s.width / 2), y: c.y + NORMAL[side].y * (s.height / 2) }
}

/** The side of `s` facing point `p` (the nearest side, measured against the box's proportions). */
export function sideToward(s: BoardShape, p: Pt): Side {
  const c = center(s)
  const nx = (p.x - c.x) / Math.max(1, s.width / 2)
  const ny = (p.y - c.y) / Math.max(1, s.height / 2)
  if (Math.abs(nx) >= Math.abs(ny)) return nx >= 0 ? 'right' : 'left'
  return ny >= 0 ? 'bottom' : 'top'
}

/** How far a pinned elbow arrow runs straight out of (and into) its side before turning. */
export const ELBOW_STUB = 24

/** Does an axis-aligned segment pass through the inside of a box? */
function crossesBox(a: Pt, b: Pt, s: BoardShape): boolean {
  const x0 = Math.min(a.x, b.x)
  const x1 = Math.max(a.x, b.x)
  const y0 = Math.min(a.y, b.y)
  const y1 = Math.max(a.y, b.y)
  return x1 > s.x + 1 && x0 < s.x + s.width - 1 && y1 > s.y + 1 && y0 < s.y + s.height - 1
}

/** Drop repeated and collinear points. */
function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    const prev = out[out.length - 2]
    if (prev && last && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))) out.pop()
    out.push(p)
  }
  return out
}

/**
 * Orthogonal route for an elbow arrow pinned to sides: out of the `from` side,
 * into the `to` side, avoiding both boxes and never doubling back where it
 * can help it. Picks the cleanest of a few candidate paths. `bend` slides the
 * middle segment of a three-segment (Z-shaped) route, like an automatic elbow.
 */
function pinnedElbow(from: BoardShape, to: BoardShape, fs: Side, ts: Side, bend: Pt): ArrowGeometry {
  const s = sidePoint(from, fs)
  const e = sidePoint(to, ts)
  const p = { x: s.x + NORMAL[fs].x * ELBOW_STUB, y: s.y + NORMAL[fs].y * ELBOW_STUB }
  const q = { x: e.x + NORMAL[ts].x * ELBOW_STUB, y: e.y + NORMAL[ts].y * ELBOW_STUB }
  const mx = (p.x + q.x) / 2 + bend.x
  const my = (p.y + q.y) / 2 + bend.y
  type Candidate = { pts: Pt[]; handle?: Pt; axis?: 'x' | 'y' }
  const candidates: Candidate[] = [
    { pts: [s, p, { x: q.x, y: p.y }, q, e] },
    { pts: [s, p, { x: p.x, y: q.y }, q, e] },
    { pts: [s, p, { x: mx, y: p.y }, { x: mx, y: q.y }, q, e], handle: { x: mx, y: (p.y + q.y) / 2 }, axis: 'x' },
    { pts: [s, p, { x: p.x, y: my }, { x: q.x, y: my }, q, e], handle: { x: (p.x + q.x) / 2, y: my }, axis: 'y' },
  ]
  // Around both boxes (above, below, left, right), for sides that face away from each other.
  const top = Math.min(from.y, to.y) - ELBOW_STUB + Math.min(0, bend.y)
  const bottom = Math.max(from.y + from.height, to.y + to.height) + ELBOW_STUB + Math.max(0, bend.y)
  const leftX = Math.min(from.x, to.x) - ELBOW_STUB + Math.min(0, bend.x)
  const rightX = Math.max(from.x + from.width, to.x + to.width) + ELBOW_STUB + Math.max(0, bend.x)
  for (const y of [top, bottom]) {
    candidates.push({ pts: [s, p, { x: p.x, y }, { x: q.x, y }, q, e], handle: { x: (p.x + q.x) / 2, y }, axis: 'y' })
  }
  for (const x of [leftX, rightX]) {
    candidates.push({ pts: [s, p, { x, y: p.y }, { x, y: q.y }, q, e], handle: { x, y: (p.y + q.y) / 2 }, axis: 'x' })
  }
  const score = ({ pts }: Candidate) => {
    // Scored before collinear points merge, so the stubs stay their own segments: a path that runs
    // out of a side and straight back through its own box must not look like one clean line.
    const path = pts.filter((pt, i) => i === 0 || pt.x !== pts[i - 1].x || pt.y !== pts[i - 1].y)
    let cost = simplify(pts).length * 10 // fewer corners is cleaner
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i]
      const b = path[i + 1]
      // The stubs touch their own box at the side; anything else going through a box is bad.
      if (i > 0 && crossesBox(a, b, from)) cost += 1000
      if (i + 2 < path.length && crossesBox(a, b, to)) cost += 1000
      const prev = path[i - 1]
      if (prev) {
        const d1 = { x: Math.sign(a.x - prev.x), y: Math.sign(a.y - prev.y) }
        const d2 = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) }
        if (d1.x === -d2.x && d1.y === -d2.y) cost += 500 // doubles back on itself
      }
      cost += (Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / 100
    }
    return cost
  }
  const best = candidates.reduce((x, y) => (score(y) < score(x) ? y : x))
  const path = simplify(best.pts)
  const d = `M ${path[0].x} ${path[0].y} ` + path.slice(1).map((pt) => `L ${pt.x} ${pt.y}`).join(' ')
  return { d, handle: best.handle, axis: best.axis, tip: e, tail: path[path.length - 2], start: s }
}

/** The side an unpinned end uses when the other end is pinned: facing the other box. */
function autoSide(self: BoardShape, other: BoardShape): Side {
  return sideToward(self, center(other))
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
  /** Where the arrow leaves its `from` shape. */
  start: Pt
}

export function arrowGeometry(
  from: BoardShape,
  to: BoardShape,
  route: ArrowRoute,
  bend: Pt = { x: 0, y: 0 },
  sides: ArrowSides = {},
): ArrowGeometry {
  const fc = center(from)
  const tc = center(to)

  // Pinned elbow: the user chose a side for at least one end; the other end faces its box.
  if (route === 'elbow' && (sides.from || sides.to)) {
    return pinnedElbow(from, to, sides.from ?? autoSide(from, to), sides.to ?? autoSide(to, from), bend)
  }

  if (route === 'curve') {
    const h = { x: (fc.x + tc.x) / 2 + bend.x, y: (fc.y + tc.y) / 2 + bend.y }
    const p0 = edgePoint(from, h)
    const p2 = edgePoint(to, h)
    // Control point chosen so the quadratic passes through h at t = 0.5.
    const c = { x: 2 * h.x - (p0.x + p2.x) / 2, y: 2 * h.y - (p0.y + p2.y) / 2 }
    return { d: `M ${p0.x} ${p0.y} Q ${c.x} ${c.y} ${p2.x} ${p2.y}`, handle: h, axis: 'xy', tip: p2, tail: c, start: p0 }
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
        start: { x: sx, y: fc.y },
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
      start: { x: fc.x, y: sy },
    }
  }

  const p0 = edgePoint(from, tc)
  const p2 = edgePoint(to, fc)
  return { d: `M ${p0.x} ${p0.y} L ${p2.x} ${p2.y}`, tip: p2, tail: p0, start: p0 }
}
