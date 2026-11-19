/**
 * Comments, threads and @mentions (see src/schemas/comments-schema.ts).
 *
 *   commentCreate   → { boardId, body, shapeId?, shapeLabel?, parentId? } — new thread or reply
 *   commentEdit     → { commentId, body }          — author only
 *   commentDelete   → { commentId }                — author or board owner; a root takes its replies
 *   commentResolve  → { commentId, resolved }      — root only; thread author or board owner
 *   mentionsMarkRead → { ids } | { threadId } | { all: true } — the caller's own notifications
 *
 * Actions run with record RBAC OFF (see src/server/action-routes.ts), so every
 * check here is the only check. Board access = the owner, or an active
 * team_members row for the board; app-level `viewer`s may comment too.
 * Author names come from the server's records, never from params, and
 * mentions are parsed from the body against the board's members, so nobody
 * can notify a person who isn't on the board.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  MAX_ID_LENGTH,
  excerpt,
  findMentions,
  parseCommentParams,
  parseEditParams,
  parseIdParam,
  type Member,
} from '../comments/model'

const fail = (error: string, code?: string): ActionResult => ({ success: false, error, code })
const denied = () => fail('Board not found or you do not have access to it.', 'forbidden')

const MAX_MARK_READ = 100
const MAX_SHAPE_LABEL = 200

type CommentData = {
  boardId: string
  shapeId?: string
  shapeLabel?: string
  parentId?: string
  authorId: string
  authorName?: string
  body: string
  mentions?: string[]
  resolved?: boolean
  editedAt?: string
}

interface Access {
  ownerId: string
  title: string
  members: Member[]
  /** The caller's display name. */
  name: string
}

/** Who may see `boardId`, or null if `userId` may not. Missing and forbidden boards look the same. */
async function loadAccess(tools: ActionTools, userId: string, boardId: string): Promise<Access | null> {
  const board = await tools.get<{ ownerId?: string; title?: string }>('boards', boardId)
  if (!board.success || !board.data.record.data.ownerId) return null
  const ownerId = board.data.record.data.ownerId
  const rows = await tools.query<{ userId: string; status?: string; name?: string }>('team_members', {
    where: { teamId: boardId },
    limit: 500,
  })
  if (!rows.success) throw new Error(rows.error)
  const members = new Map<string, string>()
  for (const r of rows.data.records) {
    if (!r.data.status || r.data.status === 'active') members.set(r.data.userId, r.data.name || '')
  }
  if (userId !== ownerId && !members.has(userId)) return null

  // The owner may not have a team_members row yet (a board nobody was sent).
  if (!members.get(ownerId)) members.set(ownerId, await userName(tools, ownerId))
  if (!members.get(userId)) members.set(userId, await userName(tools, userId))
  return {
    ownerId,
    title: board.data.record.data.title || 'a board',
    members: [...members].map(([id, name]) => ({ userId: id, name })),
    name: members.get(userId) || 'Someone',
  }
}

async function userName(tools: ActionTools, userId: string): Promise<string> {
  const res = await tools.get<{ name?: string; email?: string }>('users', userId)
  if (!res.success) return ''
  return res.data.record.data.name || res.data.record.data.email || ''
}

type Loaded = { id: string; data: CommentData; access: Access }

/** Load a comment and the caller's access to its board. */
async function loadComment(tools: ActionTools, userId: string, commentId: string): Promise<Loaded | ActionResult> {
  const res = await tools.get<CommentData>('comments', commentId)
  if (!res.success) return fail('That comment no longer exists.', 'not_found')
  const data = res.data.record.data
  const access = await loadAccess(tools, userId, data.boardId)
  // Same answer as a missing comment: don't reveal what's on boards you can't open.
  if (!access) return fail('That comment no longer exists.', 'not_found')
  return { id: commentId, data, access }
}

/** Notify each newly mentioned person (never the author). */
async function notify(
  tools: ActionTools,
  userIds: string[],
  c: { authorId: string; boardId: string; commentId: string; threadId: string; body: string },
  access: Access,
) {
  for (const uid of userIds) {
    if (uid === c.authorId) continue
    const res = await tools.create('mentions', {
      userId: uid,
      boardId: c.boardId,
      boardTitle: access.title,
      commentId: c.commentId,
      threadId: c.threadId,
      actorName: access.name,
      excerpt: excerpt(c.body),
      read: false,
    })
    if (!res.success) throw new Error(res.error)
  }
}

function cleanLabel(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const t = raw.replace(/\s+/g, ' ').trim()
  return t.length > MAX_SHAPE_LABEL ? `${t.slice(0, MAX_SHAPE_LABEL - 1)}…` : t
}

const commentCreate: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const input = parseCommentParams(params)
  if ('error' in input) return fail(input.error, 'bad_request')
  try {
    const access = await loadAccess(tools, userId, input.boardId)
    if (!access) return denied()

    let shapeId = input.shapeId ?? ''
    let shapeLabel = shapeId ? cleanLabel(params.shapeLabel) : ''
    if (input.parentId) {
      const parent = await tools.get<CommentData>('comments', input.parentId)
      if (!parent.success || parent.data.record.data.boardId !== input.boardId) {
        return fail('That thread no longer exists.', 'not_found')
      }
      // Threads are one level deep: replies hang off the root.
      if (parent.data.record.data.parentId) return fail('Reply to the thread, not to a reply.', 'bad_request')
      shapeId = parent.data.record.data.shapeId ?? ''
      shapeLabel = parent.data.record.data.shapeLabel ?? ''
    }

    const mentions = findMentions(input.body, access.members).filter((id) => id !== userId)
    const res = await tools.create('comments', {
      boardId: input.boardId,
      shapeId,
      shapeLabel,
      parentId: input.parentId ?? '',
      authorId: userId,
      authorName: access.name,
      body: input.body,
      mentions,
      resolved: false,
      editedAt: '',
    })
    if (!res.success) return fail(res.error)
    const commentId = res.data.recordId
    await notify(
      tools,
      mentions,
      { authorId: userId, boardId: input.boardId, commentId, threadId: input.parentId ?? commentId, body: input.body },
      access,
    )
    return { success: true, data: { recordId: commentId, mentions } }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

const commentEdit: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const input = parseEditParams(params)
  if ('error' in input) return fail(input.error, 'bad_request')
  try {
    const c = await loadComment(tools, userId, input.commentId)
    if ('success' in c) return c
    if (c.data.authorId !== userId) return fail('Only its author can edit a comment.', 'forbidden')

    const mentions = findMentions(input.body, c.access.members).filter((id) => id !== userId)
    const before = new Set(c.data.mentions ?? [])
    const res = await tools.update('comments', c.id, { body: input.body, mentions, editedAt: new Date().toISOString() })
    if (!res.success) return fail(res.error)
    await notify(
      tools,
      mentions.filter((id) => !before.has(id)),
      { authorId: userId, boardId: c.data.boardId, commentId: c.id, threadId: c.data.parentId || c.id, body: input.body },
      c.access,
    )
    return { success: true, data: { recordId: c.id, mentions } }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

const commentDelete: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const commentId = parseIdParam(params, 'commentId', 'comment')
  if (typeof commentId !== 'string') return fail(commentId.error, 'bad_request')
  try {
    const c = await loadComment(tools, userId, commentId)
    if ('success' in c) return c
    if (c.data.authorId !== userId && c.access.ownerId !== userId) {
      return fail('Only its author or the board owner can delete a comment.', 'forbidden')
    }
    const boardId = c.data.boardId
    let replies = 0
    if (!c.data.parentId) {
      // A thread goes with its root: replies and every notification pointing into it.
      for (;;) {
        const del = await tools.deleteWhere('comments', { boardId, parentId: c.id }, 500)
        if (!del.success) return fail(del.error)
        replies += del.data.deleted
        if (del.data.deleted < 500) break
      }
      const m = await tools.deleteWhere('mentions', { boardId, threadId: c.id }, 500)
      if (!m.success) return fail(m.error)
    } else {
      const m = await tools.deleteWhere('mentions', { boardId, commentId: c.id }, 500)
      if (!m.success) return fail(m.error)
    }
    const res = await tools.remove('comments', c.id)
    if (!res.success) return fail(res.error)
    return { success: true, data: { recordId: c.id, replies } }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

const commentResolve: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const commentId = parseIdParam(params, 'commentId', 'comment')
  if (typeof commentId !== 'string') return fail(commentId.error, 'bad_request')
  if (typeof params.resolved !== 'boolean') return fail('Say whether to resolve or reopen.', 'bad_request')
  try {
    const c = await loadComment(tools, userId, commentId)
    if ('success' in c) return c
    if (c.data.parentId) return fail('Resolve the thread, not a reply.', 'bad_request')
    if (c.data.authorId !== userId && c.access.ownerId !== userId) {
      return fail('Only the thread’s author or the board owner can resolve it.', 'forbidden')
    }
    const res = await tools.update('comments', c.id, { resolved: params.resolved })
    if (!res.success) return fail(res.error)
    return { success: true, data: { recordId: c.id, resolved: params.resolved } }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

const mentionsMarkRead: ActionHandler<Env> = async ({ userId, params, tools }) => {
  let ids: string[]
  if (params.all === true || params.threadId !== undefined) {
    const where: Record<string, unknown> = { userId }
    if (params.all !== true) {
      const threadId = parseIdParam(params, 'threadId', 'thread')
      if (typeof threadId !== 'string') return fail(threadId.error, 'bad_request')
      where.threadId = threadId
    }
    const res = await tools.query<{ userId: string; read?: boolean }>('mentions', { where, limit: 500 })
    if (!res.success) return fail(res.error)
    ids = res.data.records.filter((r) => !r.data.read).map((r) => r.recordId)
  } else {
    if (!Array.isArray(params.ids) || params.ids.length > MAX_MARK_READ) return fail('Invalid notifications.', 'bad_request')
    ids = params.ids.filter((x): x is string => typeof x === 'string' && !!x && x.length <= MAX_ID_LENGTH)
  }
  let marked = 0
  for (const id of ids) {
    const res = await tools.get<{ userId: string; read?: boolean }>('mentions', id)
    // Only your own notifications; others' ids are skipped silently.
    if (!res.success || res.data.record.data.userId !== userId || res.data.record.data.read) continue
    const up = await tools.update('mentions', id, { read: true })
    if (!up.success) return fail(up.error)
    marked++
  }
  return { success: true, data: { marked } }
}

export const commentActions: Record<string, ActionHandler<Env>> = {
  commentCreate,
  commentEdit,
  commentDelete,
  commentResolve,
  mentionsMarkRead,
}
