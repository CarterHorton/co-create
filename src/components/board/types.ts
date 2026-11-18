/**
 * The whiteboard UI talks to a BoardStore and doesn't care where shapes live:
 *   - useBoard       → DeepSpace CanvasRoom (signed in, synced, shared)
 *   - useLocalBoard  → this browser's localStorage (guest "try it" mode)
 */

import type { CanvasShapeClient } from 'deepspace'

export type ShapeKind = 'sticky' | 'box' | 'text' | 'arrow' | 'frame'
export type BoardShape = CanvasShapeClient

/** How an arrow is drawn between its two shapes. */
export type ArrowRoute = 'straight' | 'elbow' | 'curve'

export interface BoardStore {
  shapes: BoardShape[]
  /** Synced (cloud) or loaded (local). */
  connected: boolean
  canWrite: boolean
  addShape: (shape: Partial<BoardShape>) => void
  deleteShape: (id: string) => void
  move: (id: string, x: number, y: number) => void
  resize: (id: string, width: number, height: number) => void
  update: (id: string, props: Record<string, unknown>) => void
  undo: () => void
  redo: () => void
  /**
   * Run several edits as ONE undo step (multi-delete, assigning a section).
   * Optional: the shared CanvasRoom keeps a per-edit undo stack on the server,
   * so only the local store can group.
   */
  batch?: (fn: () => void) => void
}

/** Live cursors / avatars. Absent in guest mode. */
export interface BoardPresence {
  peers: { userId: string; userName: string; state: Record<string, unknown> }[]
  updateState: (state: Record<string, unknown>) => void
}
