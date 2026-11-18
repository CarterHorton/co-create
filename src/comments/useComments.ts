/**
 * A board's comments, live (the `comments` collection), grouped into threads,
 * plus the people who can be @mentioned and the actions that change them.
 * Writes go through src/actions/comments.ts, which checks board access.
 */

import { useCallback, useMemo } from 'react'
import { useQuery } from 'deepspace'
import { callAction } from '@/lib/actions'
import { groupThreads, openCounts, type CommentRow, type Member, type Thread } from './model'

interface CommentRecord {
  boardId: string
  shapeId?: string
  shapeLabel?: string
  parentId?: string
  authorId: string
  authorName?: string
  body: string
  mentions?: string[] | string
  resolved?: boolean | number
  editedAt?: string
}

export interface ThreadView extends Thread {
  shapeLabel: string
}

export interface CommentsApi {
  loading: boolean
  threads: ThreadView[]
  /** Comments in each shape's open threads. */
  counts: Map<string, number>
  members: Member[]
  rows: CommentRow[]
  create: (input: { body: string; shapeId?: string | null; shapeLabel?: string; parentId?: string | null }) => Promise<string>
  edit: (commentId: string, body: string) => Promise<void>
  remove: (commentId: string) => Promise<void>
  resolve: (commentId: string, resolved: boolean) => Promise<void>
}

const COMMENT_LIMIT = 2000

function toList(raw: CommentRecord['mentions']): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string')
  if (typeof raw === 'string' && raw) {
    try {
      const v: unknown = JSON.parse(raw)
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }
  return []
}

export function useComments(boardId: string): CommentsApi {
  const { records, status } = useQuery<CommentRecord>('comments', {
    where: { boardId },
    orderBy: 'createdAt',
    orderDir: 'asc',
    limit: COMMENT_LIMIT,
  })
  const { records: memberRows } = useQuery<{ userId: string; name?: string; status?: string }>('team_members', {
    where: { teamId: boardId },
  })

  const rows = useMemo<CommentRow[]>(
    () =>
      records.map((r) => ({
        id: r.recordId,
        boardId: r.data.boardId,
        shapeId: r.data.shapeId || null,
        parentId: r.data.parentId || null,
        authorId: r.data.authorId,
        authorName: r.data.authorName || 'Someone',
        body: r.data.body,
        mentions: toList(r.data.mentions),
        resolved: !!r.data.resolved,
        createdAt: r.createdAt,
        editedAt: r.data.editedAt || null,
      })),
    [records],
  )
  const labels = useMemo(() => new Map(records.map((r) => [r.recordId, r.data.shapeLabel || ''])), [records])
  const threads = useMemo<ThreadView[]>(
    () => groupThreads(rows).map((t) => ({ ...t, shapeLabel: labels.get(t.root.id) ?? '' })),
    [rows, labels],
  )
  const counts = useMemo(() => openCounts(threads), [threads])
  const members = useMemo<Member[]>(
    () =>
      memberRows
        .filter((m) => !m.data.status || m.data.status === 'active')
        .map((m) => ({ userId: m.data.userId, name: m.data.name || '' }))
        .filter((m) => m.name),
    [memberRows],
  )

  const create = useCallback<CommentsApi['create']>(
    async ({ body, shapeId, shapeLabel, parentId }) => {
      const res = await callAction<{ recordId: string }>('commentCreate', {
        boardId,
        body,
        shapeId: shapeId ?? undefined,
        shapeLabel,
        parentId: parentId ?? undefined,
      })
      return res.recordId
    },
    [boardId],
  )
  const edit = useCallback(async (commentId: string, body: string) => {
    await callAction('commentEdit', { commentId, body })
  }, [])
  const remove = useCallback(async (commentId: string) => {
    await callAction('commentDelete', { commentId })
  }, [])
  const resolve = useCallback(async (commentId: string, resolved: boolean) => {
    await callAction('commentResolve', { commentId, resolved })
  }, [])

  return { loading: status === 'loading', threads, counts, members, rows, create, edit, remove, resolve }
}
