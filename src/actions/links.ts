/**
 * View-only share links: a board owner shares a board read-only with people
 * outside their party via `/join/<token>`.
 *
 * Actions run with record RBAC OFF (see src/server/action-routes.ts), so every
 * handler here checks ownership itself before writing.
 *
 *   boardLinkCreate → { boardId, expiresIn: 'never'|'1d'|'7d'|'30d' }
 *                     owner only; answers { linkId, token, expiresAt }. The
 *                     token is shown once: only its SHA-256 is stored.
 *   boardLinkRevoke → { linkId, removeViewers? } — owner only; with
 *                     removeViewers, also takes the board away from everyone
 *                     who joined through this link.
 *   boardLinkRedeem → { token } — a signed-in visitor joins as a `viewer`
 *                     (never changes an existing owner/member's role).
 *                     Failed attempts are throttled per user.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { constantTimeEqual, expiryFor, hashLinkToken, linkState, newLinkToken, normalizeLinkToken } from './linkTokens'

/** Failed redeems allowed per user per window, to slow down guessing tokens. */
const MAX_FAILED_ATTEMPTS = 5
const ATTEMPT_WINDOW_MS = 60_000
/** Usable (not revoked, not expired) links per board. */
export const MAX_ACTIVE_LINKS = 20

type Row<T> = { recordId: string; createdBy: string; data: T }

type BoardRow = { title: string; ownerId: string; teamId?: string; accessVersion?: number }
type BoardLink = {
  boardId: string
  ownerId: string
  tokenHash: string
  role: string
  expiresAt?: number | null
  revokedAt?: number | null
}
type TeamMember = { teamId: string; userId: string; status?: string; role?: string; viaLink?: string }

const fail = (error: string, code?: string): ActionResult => ({ success: false, error, code })

async function queryAll<T extends Record<string, unknown>>(
  tools: ActionTools,
  collection: string,
  where: Record<string, unknown>,
  limit = 100,
): Promise<Row<T>[]> {
  const res = await tools.query<T>(collection, { where, limit })
  if (!res.success) throw new Error(res.error)
  return res.data.records as Row<T>[]
}

async function loadOwnedBoard(tools: ActionTools, userId: string, boardId: unknown): Promise<Row<BoardRow> | ActionResult> {
  if (typeof boardId !== 'string' || !boardId || boardId.length > 200) return fail('Missing board.', 'bad_request')
  const res = await tools.get<BoardRow>('boards', boardId)
  // Same answer for "missing" and "not yours": don't reveal which boards exist.
  if (!res.success || res.data.record.data.ownerId !== userId) {
    return fail('Only the board owner can manage share links.', 'forbidden')
  }
  return { ...res.data.record, recordId: boardId } as Row<BoardRow>
}

async function userName(tools: ActionTools, userId: string): Promise<string> {
  const res = await tools.get<{ name?: string; email?: string }>('users', userId)
  if (!res.success) return 'Someone'
  return res.data.record.data.name || res.data.record.data.email || 'Someone'
}

/** Add an access row unless the person already has one (never changes an existing role). */
async function addMember(
  tools: ActionTools,
  boardId: string,
  userId: string,
  role: 'owner' | 'viewer',
  viaLink?: string,
): Promise<boolean> {
  const existing = await queryAll<TeamMember>(tools, 'team_members', { teamId: boardId, userId }, 1)
  if (existing.length) return false
  const name = await userName(tools, userId)
  const row: Record<string, unknown> = { teamId: boardId, userId, status: 'active', name, role }
  if (viaLink) row.viaLink = viaLink
  const res = await tools.create('team_members', row)
  if (!res.success) throw new Error(res.error)
  return true
}

/** Re-save the board so every open board list re-checks who can see it. */
async function touchBoard(tools: ActionTools, board: Row<BoardRow>) {
  const res = await tools.update('boards', board.recordId, {
    teamId: board.recordId,
    accessVersion: (board.data.accessVersion ?? 0) + 1,
  })
  if (!res.success) throw new Error(res.error)
}

const boardLinkCreate: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const board = await loadOwnedBoard(tools, userId, params.boardId)
  if ('success' in board) return board
  const now = Date.now()
  const expiry = expiryFor(params.expiresIn, now)
  if (!expiry) return fail('Choose never, 1 day, 7 days or 30 days.', 'bad_request')

  const links = await queryAll<BoardLink>(tools, 'board_links', { boardId: board.recordId }, 500)
  if (links.filter((l) => linkState(l.data, now) === 'active').length >= MAX_ACTIVE_LINKS) {
    return fail(`A board can have at most ${MAX_ACTIVE_LINKS} active links. Revoke one first.`, 'too_many_links')
  }

  const token = newLinkToken()
  const row: Record<string, unknown> = {
    boardId: board.recordId,
    ownerId: userId,
    tokenHash: await hashLinkToken(token),
    role: 'viewer',
  }
  if (expiry.expiresAt !== undefined) row.expiresAt = expiry.expiresAt
  const res = await tools.create('board_links', row)
  if (!res.success) return fail(res.error)

  // The owner's own access row, so team-scoped reads (the share list) work.
  await addMember(tools, board.recordId, userId, 'owner')
  await touchBoard(tools, board)
  return { success: true, data: { linkId: res.data.recordId, token, expiresAt: expiry.expiresAt ?? null } }
}

const boardLinkRevoke: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const linkId = params.linkId
  if (typeof linkId !== 'string' || !linkId || linkId.length > 200) return fail('Missing link.', 'bad_request')
  const denied = fail('Only the board owner can revoke this link.', 'forbidden')
  const res = await tools.get<BoardLink>('board_links', linkId)
  if (!res.success || res.data.record.data.ownerId !== userId) return denied
  const link = res.data.record.data
  const board = await loadOwnedBoard(tools, userId, link.boardId)
  if ('success' in board) return denied

  if (!link.revokedAt) {
    const upd = await tools.update('board_links', linkId, { revokedAt: Date.now() })
    if (!upd.success) return fail(upd.error)
  }
  let removed = 0
  if (params.removeViewers === true) {
    // Scoped by board, link and role: never touches the owner or anyone sent the board directly.
    const del = await tools.deleteWhere('team_members', { teamId: board.recordId, viaLink: linkId, role: 'viewer' }, 500)
    if (!del.success) return fail(del.error)
    removed = del.data.deleted
    await touchBoard(tools, board)
  }
  return { success: true, data: { linkId, removed } }
}

const boardLinkRedeem: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const now = Date.now()

  const attempts = await queryAll<{ userId: string; at: number }>(tools, 'board_link_attempts', { userId }, 100)
  const recent = attempts.filter((a) => a.data.at > now - ATTEMPT_WINDOW_MS)
  if (recent.length >= MAX_FAILED_ATTEMPTS) {
    return fail('Too many invalid links. Wait a minute and try again.', 'rate_limited')
  }
  const failed = async (error: string, code: string): Promise<ActionResult> => {
    for (const old of attempts.filter((a) => a.data.at <= now - ATTEMPT_WINDOW_MS)) {
      await tools.remove('board_link_attempts', old.recordId)
    }
    await tools.create('board_link_attempts', { userId, at: now })
    return fail(error, code)
  }
  const invalid = () => failed('This link is not valid. Ask the board owner for a new one.', 'bad_link')

  const token = normalizeLinkToken(params.token)
  if (!token) return invalid()
  const hash = await hashLinkToken(token)
  const matches = await queryAll<BoardLink>(tools, 'board_links', { tokenHash: hash }, 5)
  const link = matches.find((m) => constantTimeEqual(m.data.tokenHash, hash))
  if (!link) return invalid()

  const state = linkState(link.data, now)
  if (state === 'revoked') return failed('This link was turned off by the board owner.', 'revoked')
  if (state === 'expired') return failed('This link has expired. Ask the board owner for a new one.', 'expired')

  const boardRes = await tools.get<BoardRow>('boards', link.data.boardId)
  if (!boardRes.success || boardRes.data.record.data.ownerId !== link.data.ownerId) return invalid()
  const board = { ...boardRes.data.record, recordId: link.data.boardId } as Row<BoardRow>

  await tools.deleteWhere('board_link_attempts', { userId })
  if (board.data.ownerId === userId) return { success: true, data: { boardId: board.recordId, role: 'owner' } }

  const added = await addMember(tools, board.recordId, userId, 'viewer', link.recordId)
  if (added) {
    await addMember(tools, board.recordId, board.data.ownerId, 'owner')
    await touchBoard(tools, board)
  }
  return { success: true, data: { boardId: board.recordId, joined: added } }
}

export const linkActions: Record<string, ActionHandler<Env>> = {
  boardLinkCreate,
  boardLinkRevoke,
  boardLinkRedeem,
}
