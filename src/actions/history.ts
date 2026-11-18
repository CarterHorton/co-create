/**
 * Board history (`versions`) and published specs (`specs`).
 *
 * The client may not create these rows directly: `create` would accept any
 * boardId, so anyone who knew a board's id could add versions or a spec
 * (which coding agents fetch via `spec_get`) to a board they can't open.
 * These actions check access first. Actions run with record RBAC OFF (see
 * src/server/action-routes.ts), so every check here is the only check.
 *
 *   versionCreate → { boardId, message, auto?, snapshot } — save a version
 *   specPublish   → { boardId, title, markdown }          — publish a spec
 *
 * Rows are created as the caller (`createdBy` = caller), so 'own' deletes and
 * reads behave as when the client created them. `authorName` comes from the
 * caller's user record, never from params.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'

export const MAX_MESSAGE_LENGTH = 500
export const MAX_TITLE_LENGTH = 300
/** Serialized snapshot JSON, in characters. Boards are small; this is generous. */
export const MAX_SNAPSHOT_CHARS = 1_000_000
export const MAX_SNAPSHOT_SHAPES = 5_000
export const MAX_MARKDOWN_CHARS = 500_000

const fail = (error: string, code?: string): ActionResult => ({ success: false, error, code })

type Invalid = { error: string }

export type VersionInput = { boardId: string; message: string; auto: boolean; snapshot: unknown[] }
export type SpecInput = { boardId: string; title: string; markdown: string }

function checkBoardId(raw: unknown): string | Invalid {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 200) return { error: 'Missing board.' }
  return raw
}

/** Validate `versionCreate` params. Pure, so it can be unit tested. */
export function parseVersionParams(params: Record<string, unknown>): VersionInput | Invalid {
  const boardId = checkBoardId(params.boardId)
  if (typeof boardId !== 'string') return boardId
  const { message, auto, snapshot } = params
  if (typeof message !== 'string' || !message.trim()) return { error: 'A version needs a message.' }
  if (message.length > MAX_MESSAGE_LENGTH) return { error: `Messages are at most ${MAX_MESSAGE_LENGTH} characters.` }
  if (auto !== undefined && typeof auto !== 'boolean') return { error: 'Invalid auto flag.' }
  if (!Array.isArray(snapshot)) return { error: 'Invalid snapshot.' }
  if (snapshot.length > MAX_SNAPSHOT_SHAPES) return { error: 'This board is too large to save a version.' }
  if (!snapshot.every((s) => s !== null && typeof s === 'object' && !Array.isArray(s))) {
    return { error: 'Invalid snapshot.' }
  }
  let json: string
  try {
    json = JSON.stringify(snapshot)
  } catch {
    return { error: 'Invalid snapshot.' }
  }
  if (json.length > MAX_SNAPSHOT_CHARS) return { error: 'This board is too large to save a version.' }
  // Round-trip so only plain JSON is stored.
  return { boardId, message, auto: auto === true, snapshot: JSON.parse(json) as unknown[] }
}

/** Validate `specPublish` params. Pure, so it can be unit tested. */
export function parseSpecParams(params: Record<string, unknown>): SpecInput | Invalid {
  const boardId = checkBoardId(params.boardId)
  if (typeof boardId !== 'string') return boardId
  const { title, markdown } = params
  if (typeof title !== 'string' || !title.trim()) return { error: 'A spec needs a title.' }
  if (title.length > MAX_TITLE_LENGTH) return { error: `Titles are at most ${MAX_TITLE_LENGTH} characters.` }
  if (typeof markdown !== 'string' || !markdown.trim()) return { error: 'A spec needs some content.' }
  if (markdown.length > MAX_MARKDOWN_CHARS) return { error: 'This spec is too large to publish.' }
  return { boardId, title, markdown }
}

type Caller = { name: string } | ActionResult

/**
 * May `userId` write history/specs for `boardId`? Owner, or an active
 * team_members row for the board, and not a viewer. Admins get no bypass.
 * Missing and forbidden boards get the same answer.
 */
async function authorizeBoardWriter(tools: ActionTools, userId: string, boardId: string): Promise<Caller> {
  const denied = fail('Board not found or you do not have access to it.', 'forbidden')

  const userRes = await tools.get<{ name?: string; email?: string; role?: string }>('users', userId)
  const user = userRes.success ? userRes.data.record.data : null
  if (user?.role === 'viewer') return denied

  const board = await tools.get<{ ownerId?: string }>('boards', boardId)
  if (!board.success) return denied
  let allowed = board.data.record.data.ownerId === userId
  if (!allowed) {
    const res = await tools.query<{ teamId: string; userId: string; status?: string }>('team_members', {
      where: { teamId: boardId, userId },
      limit: 5,
    })
    if (!res.success) return fail(res.error)
    allowed = res.data.records.some((r) => !r.data.status || r.data.status === 'active')
  }
  if (!allowed) return denied
  return { name: user?.name || user?.email || 'Someone' }
}

const versionCreate: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const input = parseVersionParams(params)
  if ('error' in input) return fail(input.error, 'bad_request')
  const caller = await authorizeBoardWriter(tools, userId, input.boardId)
  if ('success' in caller) return caller

  const res = await tools.create('versions', {
    boardId: input.boardId,
    message: input.message,
    auto: input.auto,
    authorName: caller.name,
    shapeCount: input.snapshot.length,
    snapshot: input.snapshot,
  })
  if (!res.success) return fail(res.error)
  return { success: true, data: { recordId: res.data.recordId } }
}

const specPublish: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const input = parseSpecParams(params)
  if ('error' in input) return fail(input.error, 'bad_request')
  const caller = await authorizeBoardWriter(tools, userId, input.boardId)
  if ('success' in caller) return caller

  const res = await tools.create('specs', {
    boardId: input.boardId,
    title: input.title,
    markdown: input.markdown,
    authorName: caller.name,
  })
  if (!res.success) return fail(res.error)
  return { success: true, data: { recordId: res.data.recordId } }
}

export const historyActions: Record<string, ActionHandler<Env>> = {
  versionCreate,
  specPublish,
}
