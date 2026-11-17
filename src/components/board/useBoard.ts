/**
 * useBoard — useCanvas plus local optimistic edits.
 *
 * DeepSpace's CanvasRoom broadcasts move/resize/update only to OTHER peers,
 * so the editing client never sees its own drags come back. We keep a local
 * override per field and lay it over the server copy. Each override
 * remembers the server value it was made against (its "base"); as soon as the
 * server value changes (a peer edited it, or an undo landed) the override is
 * stale and the server wins.
 */

import { useCallback, useMemo, useState } from 'react'
import { useCanvas, type CanvasShapeClient } from 'deepspace'
import { applyOverrides, nextField, samePair, type Override } from './overrides'

export type ShapeKind = 'sticky' | 'box' | 'text' | 'arrow'
export type { BoardShape } from './overrides'

export function useBoard(boardId: string) {
  const canvas = useCanvas(boardId)
  const [overrides, setOverrides] = useState<Record<string, Override>>({})

  const shapes = useMemo(() => applyOverrides(canvas.shapes, overrides), [canvas.shapes, overrides])

  const edit = useCallback(
    (id: string, fn: (old: Override, server: CanvasShapeClient) => Override) => {
      const server = canvas.shapes.find((s) => s.id === id)
      if (!server) return
      setOverrides((prev) => ({ ...prev, [id]: fn(prev[id] ?? {}, server) }))
    },
    [canvas.shapes],
  )

  const { moveShape, resizeShape, updateShape } = canvas

  const move = useCallback(
    (id: string, x: number, y: number) => {
      edit(id, (o, s) => ({ ...o, pos: nextField(o.pos, [s.x, s.y], [x, y], samePair) }))
      moveShape(id, x, y)
    },
    [edit, moveShape],
  )

  const resize = useCallback(
    (id: string, width: number, height: number) => {
      edit(id, (o, s) => ({ ...o, size: nextField(o.size, [s.width, s.height], [width, height], samePair) }))
      resizeShape(id, width, height)
    },
    [edit, resizeShape],
  )

  const update = useCallback(
    (id: string, props: Record<string, unknown>) => {
      edit(id, (o, s) => {
        const next = { ...(o.props ?? {}) }
        for (const [k, v] of Object.entries(props)) next[k] = nextField(next[k], s.props[k], v, Object.is)
        return { ...o, props: next }
      })
      updateShape(id, props)
    },
    [edit, updateShape],
  )

  return { ...canvas, shapes, move, resize, update }
}
