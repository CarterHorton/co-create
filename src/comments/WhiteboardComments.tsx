/**
 * The whiteboard's side of comments: what <Whiteboard> needs to show comment
 * badges on shapes, offer "Comment" for the selection (button and the M key),
 * and pan to a shape when a thread is opened in the Comments panel.
 *
 * The Whiteboard only renders these pieces when it's given a `comments`
 * bridge (signed-in boards); guest boards have no server and pass none.
 */

import { useEffect, useRef } from 'react'
import { MessageSquare } from 'lucide-react'
import { Hint, SHORTCUTS } from '@/components/board/shortcuts'
import { readingOrder, shapeName } from '@/components/board/a11y'
import type { BoardShape } from '@/components/board/types'
import { cn } from '@/lib/utils'
import { LiveRegion } from '@/components/board/LiveRegion'

export interface CommentsBridge {
  /** Comments in each shape's open threads. */
  counts: Map<string, number>
  /** Start a new thread on a shape (the Comment button or M). */
  onComment: (shapeId: string, label: string) => void
  /** A shape's comment badge was activated. */
  onShowThreads: (shapeId: string) => void
  /** Pan to and focus this shape; a new object each time. */
  focus: { shapeId: string } | null
  /** Other people's new comments, for screen readers (a polite live region). */
  announcement: string
}

export const COMMENT_KEY = SHORTCUTS.comment[0].toLowerCase()

interface Camera {
  x: number
  y: number
  zoom: number
}

/**
 * Wires the bridge into the board: M on the selected shape starts a comment,
 * and focus requests pan to (and focus) their shape.
 */
export function useCommentsBridge(
  comments: CommentsBridge | undefined,
  {
    active,
    byId,
    focusShape,
  }: { active: BoardShape | undefined; byId: Map<string, BoardShape>; focusShape: (id: string) => void },
) {
  const latest = useRef({ comments, active, byId })
  useEffect(() => {
    latest.current = { comments, active, byId }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== COMMENT_KEY) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      // Only on the board: not while a dialog or the comments panel has focus.
      if (t && t !== document.body && !t.closest('[data-testid="board-viewport"]')) return
      const { comments: c, active: a, byId: ids } = latest.current
      if (!c || !a) return
      e.preventDefault()
      c.onComment(a.id, shapeName(a, ids))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Focusing a shape selects it and pans it into view (the board's own focus handler).
  const request = comments?.focus
  useEffect(() => {
    if (request && latest.current.byId.has(request.shapeId)) focusShape(request.shapeId)
  }, [request, focusShape])
}

/** "Comment" for the selection bar (one shape selected). */
export function CommentButton({ onClick }: { onClick: () => void }) {
  return (
    <Hint label="Comment on this shape" shortcut="comment" side="top">
      <button
        type="button"
        data-testid="selection-comment"
        aria-keyshortcuts="M"
        onClick={onClick}
        className="flex h-8 items-center gap-1 border border-foreground px-2 text-xs font-bold uppercase tracking-[0.05em] hover:bg-royal/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <MessageSquare className="size-3.5" aria-hidden /> Comment
      </button>
    </Hint>
  )
}

/**
 * Comment badges (one per shape with open threads) and, for people who can't
 * edit the board (so get no selection bar), a small Comment bar on the
 * selected shape. Drawn over the canvas in screen space, after it in Tab order.
 */
export function CommentsLayer({
  bridge,
  cam,
  view,
  shapes,
  byId,
  active,
  showBar,
}: {
  bridge: CommentsBridge
  cam: Camera
  view: { width: number; height: number }
  shapes: BoardShape[]
  byId: Map<string, BoardShape>
  active: BoardShape | undefined
  /** Show the Comment bar for `active` (viewers: no selection bar to hold the button). */
  showBar: boolean
}) {
  const withComments = readingOrder(shapes.filter((s) => s.type !== 'arrow' && (bridge.counts.get(s.id) ?? 0) > 0))
  const toScreen = (x: number, y: number) => ({ left: cam.x + x * cam.zoom, top: cam.y + y * cam.zoom })
  const onScreen = (p: { left: number; top: number }) =>
    !view.width || (p.left > -24 && p.top > -24 && p.left < view.width + 24 && p.top < view.height + 24)

  const bar = showBar && active && active.type !== 'arrow' ? toScreen(active.x, active.y) : null

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" data-testid="comments-layer">
      <LiveRegion message={bridge.announcement} testId="comments-announcer" />
      {withComments.map((s) => {
        const n = bridge.counts.get(s.id) ?? 0
        const p = toScreen(s.x + s.width, s.y)
        if (!onScreen(p)) return null
        const label = `${n} comment${n === 1 ? '' : 's'} on ${shapeName(s, byId)}`
        return (
          <button
            key={s.id}
            type="button"
            data-testid="comment-badge"
            data-shape-id={s.id}
            aria-label={label}
            title={label}
            onClick={() => bridge.onShowThreads(s.id)}
            className="pointer-events-auto absolute flex h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5 border border-foreground bg-background px-1 font-mono text-[11px] font-bold shadow-[2px_2px_0_0_#000] hover:bg-royal/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            style={{ left: p.left, top: p.top }}
          >
            <MessageSquare className="size-3" aria-hidden />
            {n}
          </button>
        )
      })}
      {bar && active && (
        <div
          data-testid="comment-bar"
          className={cn(
            'pointer-events-auto absolute flex items-center border border-foreground bg-background p-1 shadow-[4px_4px_0_0_#000]',
          )}
          style={{ left: Math.max(16, bar.left), top: Math.max(72, bar.top - 48) }}
        >
          <CommentButton onClick={() => bridge.onComment(active.id, shapeName(active, byId))} />
        </div>
      )}
    </div>
  )
}
