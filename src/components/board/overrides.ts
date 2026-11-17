/**
 * Pure merge logic for useBoard's optimistic edits (kept free of React and
 * the SDK runtime so it can be unit-tested). See useBoard.ts for the why.
 */

import type { CanvasShapeClient } from 'deepspace'
import type { BoardShape } from './types'
type Pair = [number, number]
interface Field<T> {
  value: T
  base: T
}
export interface Override {
  pos?: Field<Pair>
  size?: Field<Pair>
  props?: Record<string, Field<unknown>>
}

export const samePair = (a: Pair, b: Pair) => a[0] === b[0] && a[1] === b[1]

/** Keep the existing base while it still matches the server; otherwise re-base. */
export function nextField<T>(old: Field<T> | undefined, server: T, value: T, eq: (a: T, b: T) => boolean): Field<T> {
  return { value, base: old && eq(old.base, server) ? old.base : server }
}

/** Lay local edits over the server copy, skipping any field the server has since changed. */
export function applyOverrides(server: CanvasShapeClient[], overrides: Record<string, Override>): BoardShape[] {
  return server.map((s) => {
    const o = overrides[s.id]
    if (!o) return s
    const out: CanvasShapeClient = { ...s }
    if (o.pos && samePair(o.pos.base, [s.x, s.y])) [out.x, out.y] = o.pos.value
    if (o.size && samePair(o.size.base, [s.width, s.height])) [out.width, out.height] = o.size.value
    if (o.props) {
      out.props = { ...s.props }
      for (const [k, f] of Object.entries(o.props)) {
        if (Object.is(s.props[k], f.base)) out.props[k] = f.value
      }
    }
    return out
  })
}

