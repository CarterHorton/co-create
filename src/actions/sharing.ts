/**
 * Friend codes, friends ("party") and board sharing.
 *
 * Actions run with record RBAC OFF (see src/server/action-routes.ts), so every
 * handler here checks ownership itself before writing.
 *
 *   friendCodeCreate  → a fresh 32-bit code (8 hex chars) valid for 20 s
 *   friendCodeRedeem  → { code } — makes caller and code owner friends (both ways)
 *   friendRemove      → { friendId } — unfriends both ways and revokes boards
 *                       either of them had sent the other
 *   boardShare        → { boardId, friendId } — owner sends a board to a friend
 *   boardRevoke       → { boardId, userId }   — owner takes access away
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'

export const FRIEND_CODE_TTL_MS = 20_000
/** Failed redeems allowed per user per window, to slow down guessing codes. */
const MAX_FAILED_ATTEMPTS = 5
const ATTEMPT_WINDOW_MS = 60_000

type Row<T> = { recordId: string; createdBy: string; data: T }

type FriendCode = {
  code: string
  ownerId: string
  expiresAt: number
}
type BoardRow = {
  title: string
  ownerId: string
  teamId?: string
  accessVersion?: number
}
type TeamMember = {
  teamId: string
  userId: string
  status?: string
  name?: string
  role?: string
}

const fail = (error: string, code?: string): ActionResult => ({ success: false, error, code })

/** 32 random bits from the CSPRNG, as 8 uppercase hex chars (the UI shows them as XXXX-XXXX). */
function newCode(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0].toString(16).toUpperCase().padStart(8, '0')
}

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.replace(/[\s-]/g, '').toUpperCase()
  return /^[0-9A-F]{8}$/.test(code) ? code : null
}

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

async function userName(tools: ActionTools, userId: string): Promise<string> {
  const res = await tools.get<{ name?: string; email?: string }>('users', userId)
  if (!res.success) return 'Someone'
  return res.data.record.data.name || res.data.record.data.email || 'Someone'
}

async function areFriends(tools: ActionTools, a: string, b: string): Promise<boolean> {
  return (await queryAll(tools, 'friendships', { ownerId: a, friendId: b }, 1)).length > 0
}

async function addFriendship(tools: ActionTools, ownerId: string, friendId: string, friendName: string) {
  if (await areFriends(tools, ownerId, friendId)) return
  const res = await tools.create('friendships', { ownerId, friendId, friendName })
  if (!res.success) throw new Error(res.error)
}

async function loadOwnedBoard(
  tools: ActionTools,
  userId: string,
  boardId: unknown,
): Promise<Row<BoardRow> | ActionResult> {
  if (typeof boardId !== 'string' || !boardId) return fail('Missing board.', 'bad_request')
  const res = await tools.get<BoardRow>('boards', boardId)
  // Same answer for "missing" and "not yours": don't reveal which boards exist.
  if (!res.success || res.data.record.data.ownerId !== userId) {
    return fail('Only the board owner can change who has access.', 'forbidden')
  }
  return { ...res.data.record, recordId: boardId } as Row<BoardRow>
}

async function addMember(tools: ActionTools, boardId: string, userId: string, role: 'owner' | 'editor') {
  const existing = await queryAll<TeamMember>(tools, 'team_members', { teamId: boardId, userId }, 1)
  if (existing.length) return
  const name = await userName(tools, userId)
  const res = await tools.create('team_members', { teamId: boardId, userId, status: 'active', name, role })
  if (!res.success) throw new Error(res.error)
}

/** Re-save the board so every open board list re-checks who can see it. */
async function touchBoard(tools: ActionTools, board: Row<BoardRow>) {
  const res = await tools.update('boards', board.recordId, {
    teamId: board.recordId,
    accessVersion: (board.data.accessVersion ?? 0) + 1,
  })
  if (!res.success) throw new Error(res.error)
}

const friendCodeCreate: ActionHandler<Env> = async ({ userId, tools }) => {
  // One live code per person: a new code replaces the last one.
  await tools.deleteWhere('friend_codes', { ownerId: userId })

  const now = Date.now()
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = newCode()
    const clashes = await queryAll<FriendCode>(tools, 'friend_codes', { code })
    const live = clashes.filter((c) => c.data.expiresAt > now)
    for (const stale of clashes.filter((c) => c.data.expiresAt <= now)) {
      await tools.remove('friend_codes', stale.recordId)
    }
    if (live.length) continue

    const expiresAt = now + FRIEND_CODE_TTL_MS
    const res = await tools.create('friend_codes', { code, ownerId: userId, expiresAt })
    if (!res.success) return fail(res.error)
    return { success: true, data: { code, expiresAt, ttlMs: FRIEND_CODE_TTL_MS } }
  }
  return fail('Too many codes in use right now. Try again in a few seconds.', 'busy')
}

const friendCodeRedeem: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const now = Date.now()

  const attempts = await queryAll<{ userId: string; at: number }>(tools, 'friend_code_attempts', { userId }, 100)
  const recent = attempts.filter((a) => a.data.at > now - ATTEMPT_WINDOW_MS)
  if (recent.length >= MAX_FAILED_ATTEMPTS) {
    return fail('Too many wrong codes. Wait a minute and try again.', 'rate_limited')
  }
  const recordFailure = async () => {
    for (const old of attempts.filter((a) => a.data.at <= now - ATTEMPT_WINDOW_MS)) {
      await tools.remove('friend_code_attempts', old.recordId)
    }
    await tools.create('friend_code_attempts', { userId, at: now })
  }

  const code = normalizeCode(params.code)
  if (!code) {
    await recordFailure()
    return fail('Friend codes are 8 characters, 0–9 and A–F.', 'bad_code')
  }

  const matches = await queryAll<FriendCode>(tools, 'friend_codes', { code })
  const match = matches.find((c) => c.data.expiresAt > now)
  if (!match) {
    await recordFailure()
    return fail('That code is wrong or has expired. Ask for a new one.', 'bad_code')
  }
  const friendId = match.data.ownerId
  if (friendId === userId) return fail("That's your own code — share it with a friend.", 'own_code')

  const [myName, friendName] = await Promise.all([userName(tools, userId), userName(tools, friendId)])
  await addFriendship(tools, userId, friendId, friendName)
  await addFriendship(tools, friendId, userId, myName)
  // Single use.
  await tools.remove('friend_codes', match.recordId)
  await tools.deleteWhere('friend_code_attempts', { userId })

  return { success: true, data: { friendId, friendName } }
}

/**
 * Take `memberId` off every board `ownerId` owns. Found via memberId's own
 * team_members rows; each board's owner is checked before anything is deleted.
 */
async function revokeOwnedBoards(tools: ActionTools, ownerId: string, memberId: string) {
  const memberships = await queryAll<TeamMember>(tools, 'team_members', { userId: memberId }, 1000)
  const boardIds = [...new Set(memberships.map((m) => m.data.teamId))]
  for (const boardId of boardIds) {
    const res = await tools.get<BoardRow>('boards', boardId)
    if (!res.success || res.data.record.data.ownerId !== ownerId) continue
    const del = await tools.deleteWhere('team_members', { teamId: boardId, userId: memberId })
    if (!del.success) throw new Error(del.error)
    await touchBoard(tools, { ...res.data.record, recordId: boardId } as Row<BoardRow>)
  }
}

const friendRemove: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const friendId = params.friendId
  if (typeof friendId !== 'string' || !friendId) return fail('Missing friend.', 'bad_request')
  if (friendId === userId) return fail("You can't remove yourself.", 'bad_request')

  // Both directions, each scoped by both ids so nobody else's rows are touched.
  // With the uniqueOn rows gone, a new friend code can make them friends again.
  for (const where of [
    { ownerId: userId, friendId },
    { ownerId: friendId, friendId: userId },
  ]) {
    const del = await tools.deleteWhere('friendships', where)
    if (!del.success) return fail(del.error)
  }

  // Boards can only be shared between friends, so unsharing goes both ways too.
  await revokeOwnedBoards(tools, userId, friendId)
  await revokeOwnedBoards(tools, friendId, userId)
  return { success: true, data: { friendId } }
}

const boardShare: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const board = await loadOwnedBoard(tools, userId, params.boardId)
  if ('success' in board) return board
  const friendId = params.friendId
  if (typeof friendId !== 'string' || !friendId) return fail('Missing friend.', 'bad_request')
  if (friendId === userId) return fail('You already have this board.', 'bad_request')
  if (!(await areFriends(tools, userId, friendId))) {
    return fail('You can only send boards to people in your party.', 'not_friends')
  }

  await addMember(tools, board.recordId, userId, 'owner')
  await addMember(tools, board.recordId, friendId, 'editor')
  await touchBoard(tools, board)
  return { success: true, data: { boardId: board.recordId, userId: friendId } }
}

const boardRevoke: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const board = await loadOwnedBoard(tools, userId, params.boardId)
  if ('success' in board) return board
  const memberId = params.userId
  if (typeof memberId !== 'string' || !memberId) return fail('Missing person.', 'bad_request')
  if (memberId === userId) return fail("You own this board; you can't remove yourself.", 'bad_request')

  await tools.deleteWhere('team_members', { teamId: board.recordId, userId: memberId })
  await touchBoard(tools, board)
  return { success: true, data: { boardId: board.recordId, userId: memberId } }
}

export const sharingActions: Record<string, ActionHandler<Env>> = {
  friendCodeCreate,
  friendCodeRedeem,
  friendRemove,
  boardShare,
  boardRevoke,
}
