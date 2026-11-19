/**
 * Everything a signed-in board page needs for comments, in one hook:
 *   - `bridge`  → <Whiteboard comments={…}>: badges, Comment / M, pan to shape
 *   - `pane`    → a "Comments" tab for <BoardSidebar>
 *   - `select`  → <BoardSidebar select={…}>: brings that tab forward
 * plus polite announcements of other people's new comments, and the
 * `?thread=<id>` link that mention notifications open.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageSquare } from 'lucide-react'
import { useAnnouncer } from '@/components/board/LiveRegion'
import type { SidebarPane } from '@/components/board/BoardSidebar'
import type { BoardShape } from '@/components/board/types'
import { callAction } from '@/lib/actions'
import { CommentsPanel, threadPlace, type ComposeTarget } from './CommentsPanel'
import { useComments } from './useComments'
import { excerpt } from './model'
import type { CommentsBridge } from './WhiteboardComments'

export const COMMENTS_PANE = 'comments'

/** More new comments than this at once is a (re)load, not people typing. */
const BULK = 5

export function useBoardComments({
  boardId,
  userId,
  isOwner,
  shapes,
}: {
  boardId: string
  userId: string
  isOwner: boolean
  /** The live board's shapes. */
  shapes: BoardShape[]
}) {
  const api = useComments(boardId)
  const [compose, setCompose] = useState<ComposeTarget | null>(null)
  const [shapeFilter, setShapeFilter] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ shapeId: string } | null>(null)
  const [select, setSelect] = useState<{ id: string } | null>(null)
  const [params, setParams] = useSearchParams()
  const [highlight, setHighlight] = useState<{ threadId: string } | null>(null)

  // Opened from a mention: ?thread=<id> → show the Comments tab and that thread, then drop the param.
  const linked = params.get('thread')
  useEffect(() => {
    if (!linked) return
    setSelect({ id: COMMENTS_PANE })
    setShapeFilter(null)
    setHighlight({ threadId: linked })
    // Opening the link counts as reading every mention of you in that thread.
    void callAction('mentionsMarkRead', { threadId: linked }).catch(() => undefined)
    setParams(
      (p) => {
        p.delete('thread')
        return p
      },
      { replace: true },
    )
  }, [linked, setParams])

  // ── Announce other people's new comments (politely, once each) ──────────
  const { message, say } = useAnnouncer()
  const seen = useRef<Set<string> | null>(null)
  const byId = useMemo(() => new Map(shapes.map((s) => [s.id, s])), [shapes])
  useEffect(() => {
    // What the first load brings is history, not news.
    if (!seen.current) {
      if (api.loading) return
      seen.current = new Set(api.rows.map((r) => r.id))
      return
    }
    const fresh = api.rows.filter((r) => !seen.current!.has(r.id))
    for (const r of fresh) seen.current.add(r.id)
    if (fresh.length > BULK) return
    for (const r of fresh) {
      if (r.authorId === userId) continue
      const thread = api.threads.find((t) => t.root.id === (r.parentId ?? r.id))
      const place = thread ? threadPlace(thread, byId) : 'the board'
      const verb = r.parentId ? 'replied on' : 'commented on'
      say(`${r.authorName} ${verb} ${place}: ${excerpt(r.body, 100)}`, `comment-${r.id}`)
    }
  }, [api.loading, api.rows, api.threads, byId, userId, say])

  const bridge = useMemo<CommentsBridge>(
    () => ({
      counts: api.counts,
      focus,
      announcement: message,
      onComment: (shapeId, label) => {
        setCompose({ shapeId, label })
        setSelect({ id: COMMENTS_PANE })
      },
      onShowThreads: (shapeId) => {
        setShapeFilter(shapeId)
        setSelect({ id: COMMENTS_PANE })
      },
    }),
    [api.counts, focus, message],
  )
  const openShape = useCallback((shapeId: string) => setFocus({ shapeId }), [])

  const openCount = api.threads.filter((t) => !t.root.resolved).length
  const pane: SidebarPane = {
    id: COMMENTS_PANE,
    label: 'Comments',
    Icon: MessageSquare,
    badge: openCount ? (
      <span data-testid="comments-open-count" className="font-mono text-[10px]">
        {openCount}
        <span className="sr-only"> open</span>
      </span>
    ) : null,
    content: (
      <CommentsPanel
          api={api}
          shapes={shapes}
          userId={userId}
          isOwner={isOwner}
          compose={compose}
          onComposeClear={() => setCompose(null)}
          shapeFilter={shapeFilter}
          onShapeFilter={setShapeFilter}
          highlight={highlight}
          onOpenShape={openShape}
        />
    ),
  }

  return { bridge, pane, select }
}
