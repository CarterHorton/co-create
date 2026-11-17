/**
 * useLocalBoard — a BoardStore kept entirely in this browser (localStorage).
 * Used by the guest "try it" board: nothing reaches the server, nothing is
 * shared, and clearing site data erases it.
 *
 * Undo/redo snapshots the shape list. A drag fires dozens of moves, so
 * consecutive edits of the same kind to the same shape within a short window
 * collapse into one undo step.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BoardShape, BoardStore } from './types'

export const LOCAL_BOARD_KEY = 'co-create:try-board:v1'
const COALESCE_MS = 800
const MAX_HISTORY = 200

interface Saved {
  title: string
  shapes: BoardShape[]
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(LOCAL_BOARD_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>
      if (Array.isArray(parsed.shapes)) {
        return { title: typeof parsed.title === 'string' ? parsed.title : 'Untitled board', shapes: parsed.shapes }
      }
    }
  } catch {
    // Corrupt or blocked storage: start fresh.
  }
  return { title: 'Untitled board', shapes: [] }
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

export function useLocalBoard(): BoardStore & {
  title: string
  setTitle: (t: string) => void
  clear: () => void
  saveError: boolean
} {
  const [initial] = useState(load)
  const [shapes, setShapes] = useState<BoardShape[]>(initial.shapes)
  const [title, setTitle] = useState(initial.title)
  const [saveError, setSaveError] = useState(false)
  // Source of truth for edits; React state mirrors it for rendering. Kept in a
  // ref so history bookkeeping never runs inside a state updater.
  const current = useRef<BoardShape[]>(initial.shapes)
  const past = useRef<BoardShape[][]>([])
  const future = useRef<BoardShape[][]>([])
  const last = useRef<{ key: string; at: number } | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_BOARD_KEY, JSON.stringify({ title, shapes } satisfies Saved))
      setSaveError(false)
    } catch {
      setSaveError(true)
    }
  }, [title, shapes])

  /** Apply a change, recording an undo step unless it continues the last gesture. */
  const commit = useCallback((key: string | null, fn: (prev: BoardShape[]) => BoardShape[]) => {
    const prev = current.current
    const next = fn(prev)
    if (next === prev) return
    const now = Date.now()
    const continues = key !== null && last.current?.key === key && now - last.current.at < COALESCE_MS
    if (!continues) {
      past.current.push(prev)
      if (past.current.length > MAX_HISTORY) past.current.shift()
    }
    future.current = []
    last.current = key ? { key, at: now } : null
    current.current = next
    setShapes(next)
  }, [])

  const patch = useCallback(
    (op: string, id: string, change: (s: BoardShape) => BoardShape) =>
      commit(`${op}:${id}`, (prev) => {
        let hit = false
        const next = prev.map((s) => {
          if (s.id !== id) return s
          hit = true
          return { ...change(s), updatedAt: new Date().toISOString() }
        })
        return hit ? next : prev
      }),
    [commit],
  )

  const store: BoardStore = {
    shapes,
    connected: true,
    canWrite: true,
    addShape: useCallback(
      (shape: Partial<BoardShape>) => {
        const now = new Date().toISOString()
        commit(null, (prev) => [
          ...prev,
          {
            id: newId(),
            type: shape.type ?? 'box',
            x: shape.x ?? 0,
            y: shape.y ?? 0,
            width: shape.width ?? 0,
            height: shape.height ?? 0,
            props: shape.props ?? {},
            createdBy: 'guest',
            createdAt: now,
            updatedAt: now,
          },
        ])
      },
      [commit],
    ),
    deleteShape: useCallback(
      (id: string) =>
        commit(null, (prev) => {
          const next = prev.filter((s) => s.id !== id)
          return next.length === prev.length ? prev : next
        }),
      [commit],
    ),
    move: useCallback((id: string, x: number, y: number) => patch('move', id, (s) => ({ ...s, x, y })), [patch]),
    resize: useCallback(
      (id: string, width: number, height: number) => patch('resize', id, (s) => ({ ...s, width, height })),
      [patch],
    ),
    update: useCallback(
      (id: string, props: Record<string, unknown>) =>
        patch(`props:${Object.keys(props).sort().join(',')}`, id, (s) => ({ ...s, props: { ...s.props, ...props } })),
      [patch],
    ),
    undo: useCallback(() => {
      const prev = past.current.pop()
      if (!prev) return
      last.current = null
      future.current.push(current.current)
      current.current = prev
      setShapes(prev)
    }, []),
    redo: useCallback(() => {
      const next = future.current.pop()
      if (!next) return
      last.current = null
      past.current.push(current.current)
      current.current = next
      setShapes(next)
    }, []),
  }

  const clear = useCallback(() => commit(null, (prev) => (prev.length ? [] : prev)), [commit])

  return { ...store, title, setTitle, clear, saveError }
}
