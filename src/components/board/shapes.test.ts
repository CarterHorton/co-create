import { describe, expect, it } from 'vitest'
import type { BoardShape } from './types'
import { SIDES, arrowGeometry, arrowSides, sidePoint, sideToward } from './shapes'

const box = (id: string, x: number, y: number, width = 200, height = 100): BoardShape => ({
  id,
  type: 'box',
  x,
  y,
  width,
  height,
  props: {},
  createdBy: 'u',
  createdAt: '',
  updatedAt: '',
})

/** Points of an "M x y L x y …" path. */
const points = (d: string) =>
  [...d.matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }))

/** Does any segment of the path pass through the inside of `s`? */
const crosses = (pts: { x: number; y: number }[], s: BoardShape) =>
  pts.slice(1).some((b, i) => {
    const a = pts[i]
    return (
      Math.max(a.x, b.x) > s.x + 1 &&
      Math.min(a.x, b.x) < s.x + s.width - 1 &&
      Math.max(a.y, b.y) > s.y + 1 &&
      Math.min(a.y, b.y) < s.y + s.height - 1
    )
  })

describe('pinned elbow arrows', () => {
  const left = box('a', 0, 0)
  const right = box('b', 400, 0)

  it('leaves and enters at the chosen sides, with only straight runs and right angles', () => {
    const g = arrowGeometry(left, right, 'elbow', undefined, { from: 'bottom', to: 'bottom' })
    const pts = points(g.d)
    expect(g.start).toEqual(sidePoint(left, 'bottom'))
    expect(g.tip).toEqual(sidePoint(right, 'bottom'))
    expect(pts[0]).toEqual({ x: 100, y: 100 })
    expect(pts.at(-1)).toEqual({ x: 500, y: 100 })
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y).toBe(true)
    }
    // Comes in from below: the last run points up into the box.
    expect(pts.at(-2)!.y).toBeGreaterThan(100)
    expect(crosses(pts, left) || crosses(pts, right)).toBe(false)
  })

  it('routes around the boxes when the sides face away from each other', () => {
    const g = arrowGeometry(left, right, 'elbow', undefined, { from: 'left', to: 'right' })
    const pts = points(g.d)
    expect(pts[0]).toEqual(sidePoint(left, 'left'))
    expect(pts.at(-1)).toEqual(sidePoint(right, 'right'))
    expect(crosses(pts, left) || crosses(pts, right)).toBe(false)
  })

  it('never routes through either box, for every pair of sides and layout', () => {
    const layouts = [box('b', 400, 0), box('b', 0, 300), box('b', 400, 300), box('b', -400, -200), box('b', 120, 160), box('b', 50, 400, 100, 60)]
    const bad: string[] = []
    for (const other of layouts) {
      for (const from of SIDES) {
        for (const to of SIDES) {
          const pts = points(arrowGeometry(left, other, 'elbow', undefined, { from, to }).d)
          // Runs that only touch a box's edge (leaving or entering it) don't count as crossing it.
          if (crosses(pts, left) || crosses(pts, other)) bad.push(`${from}->${to} @${other.x},${other.y}`)
        }
      }
    }
    expect(bad).toEqual([])
  })

  it('points the unpinned end at the other box', () => {
    const below = box('c', 0, 400)
    const g = arrowGeometry(left, below, 'elbow', undefined, { from: 'right' })
    expect(g.start).toEqual(sidePoint(left, 'right'))
    expect(g.tip).toEqual(sidePoint(below, 'top'))
  })

  it('leaves unpinned elbow arrows exactly as before', () => {
    const g = arrowGeometry(left, right, 'elbow')
    expect(g.d).toBe('M 200 50 H 300 V 50 H 400')
  })

  it('reads only valid sides from props', () => {
    expect(arrowSides({ ...box('x', 0, 0), props: { fromSide: 'top', toSide: 'sideways' } })).toEqual({
      from: 'top',
      to: undefined,
    })
  })
})

describe('sideToward', () => {
  it('picks the side nearest a point, scaled to the box shape', () => {
    const b = box('b', 0, 0, 400, 100) // wide: centre (200, 50)
    expect(sideToward(b, { x: 200, y: -10 })).toBe('top')
    expect(sideToward(b, { x: 420, y: 60 })).toBe('right')
    expect(sideToward(b, { x: 300, y: 140 })).toBe('bottom')
    expect(sideToward(b, { x: -30, y: 50 })).toBe('left')
  })
})
