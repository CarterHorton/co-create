/**
 * Putting a template's shapes onto a board.
 *
 * Signed in: /home creates the board, then `queueTemplate` leaves a note in
 * this tab's sessionStorage and navigates; the board page's `useTemplateSeed`
 * picks it up once the CanvasRoom has connected and sent its shapes, and adds
 * the template only if the board is still empty. The note is per tab and is
 * removed before seeding, so a second tab (or a reload) never seeds again.
 *
 * Guest (/try): `applyTemplate` straight into the localStorage store, as one
 * undo step.
 */

import { useEffect, useRef } from 'react'
import type { BoardStore } from '@/components/board/types'
import { centredOrigin, instantiateTemplate, templateBounds } from './instantiate'
import { templateById, type BoardTemplate } from './templates'

const pendingKey = (boardId: string) => `co-create:pending-template:${boardId}`

/** Remember to seed `templateId` into `boardId` when its page opens in this tab. */
export function queueTemplate(boardId: string, templateId: string) {
  const t = templateById(templateId)
  if (!t || !t.shapes.length) return
  try {
    sessionStorage.setItem(pendingKey(boardId), t.id)
  } catch {
    // Storage blocked: the board just starts blank.
  }
}

function takePending(boardId: string): BoardTemplate | undefined {
  try {
    const id = sessionStorage.getItem(pendingKey(boardId))
    sessionStorage.removeItem(pendingKey(boardId))
    return templateById(id)
  } catch {
    return undefined
  }
}

function hasPending(boardId: string) {
  try {
    return sessionStorage.getItem(pendingKey(boardId)) !== null
  } catch {
    return false
  }
}

/** Size of the whiteboard's viewport on screen (the window, if it isn't mounted yet). */
export function boardViewSize(): { width: number; height: number } {
  const el = document.querySelector<HTMLElement>('[data-testid="board-viewport"]')
  if (el && el.clientWidth && el.clientHeight) return { width: el.clientWidth, height: el.clientHeight }
  return { width: window.innerWidth, height: window.innerHeight }
}

/** Add a template's shapes, centred in the board's initial view. */
export function applyTemplate(store: Pick<BoardStore, 'addShape' | 'batch'>, t: BoardTemplate) {
  if (!t.shapes.length) return 0
  const shapes = instantiateTemplate(t, { origin: centredOrigin(templateBounds(t), boardViewSize()) })
  const run = () => shapes.forEach((s) => store.addShape(s))
  if (store.batch) store.batch(run)
  else run()
  return shapes.length
}

/**
 * Wait after the room says we may write: the initial shape list arrives in
 * its own message right behind that, and an existing board must never be
 * seeded on top of.
 */
const SETTLE_MS = 400

/** Seed a template queued for this board by /home (see queueTemplate). */
export function useTemplateSeed(boardId: string, store: BoardStore) {
  const latest = useRef(store)
  latest.current = store
  const ready = store.connected && store.canWrite

  useEffect(() => {
    if (!ready || !hasPending(boardId)) return
    const timer = setTimeout(() => {
      const s = latest.current
      if (!s.connected || !s.canWrite) return
      const t = takePending(boardId)
      if (t && s.shapes.length === 0) applyTemplate(s, t)
    }, SETTLE_MS)
    return () => clearTimeout(timer)
  }, [boardId, ready])
}
