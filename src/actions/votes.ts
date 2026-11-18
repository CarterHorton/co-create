/**
 * Voting on sticky notes. Actions run with record RBAC OFF (see
 * src/server/action-routes.ts), so every check here is the only check.
 *
 *   voteToggle     → { boardId, shapeId, staleShapeIds? } — add or remove the
 *                    caller's vote on a note. Anyone who can open the board may
 *                    vote, viewers included. While a round is active, adding is
 *                    refused once the caller holds `perPerson` votes.
 *                    `staleShapeIds` are notes the client no longer sees on the
 *                    board: the caller's own votes on them are dropped first, so
 *                    votes on deleted notes don't use up the limit (removing
 *                    your own vote is always allowed, so this grants nothing).
 *   voteRoundStart → { boardId, limit, clear? } — owner starts a dot-voting round
 *   voteRoundEnd   → { boardId }                — owner ends it (votes stay)
 *   voteClear      → { boardId }                — owner removes every vote
 *
 * Votes are created as the caller, so `createdBy` = `userId` = the voter.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { MAX_VOTES_PER_USER, decideAdd, parseRoundParams, parseToggleParams, type VoteRound } from '../votes/logic'

const fail = (error: string, code?: string): ActionResult => ({ success: false, error, code })
const DENIED = 'Board not found or you do not have access to it.'
const DRAIN_LIMIT = 500

type RoundRow = { boardId: string; perPerson: number; active?: boolean | number }

/** Owner, or an active team_members row. Missing and forbidden boards get the same answer. */
async function boardAccess(tools: ActionTools, userId: string, boardId: string): Promise<{ owner: boolean } | null> {
  const board = await tools.get<{ ownerId?: string }>('boards', boardId)
  if (!board.success) return null
  if (board.data.record.data.ownerId === userId) return { owner: true }
  const res = await tools.query<{ status?: string }>('team_members', { where: { teamId: boardId, userId }, limit: 5 })
  if (!res.success) return null
  return res.data.records.some((r) => !r.data.status || r.data.status === 'active') ? { owner: false } : null
}

async function loadRound(tools: ActionTools, boardId: string): Promise<{ recordId: string; round: VoteRound } | null> {
  const res = await tools.query<RoundRow>('vote_rounds', { where: { boardId }, limit: 1 })
  if (!res.success) throw new Error(res.error)
  const row = res.data.records[0]
  if (!row) return null
  return { recordId: row.recordId, round: { limit: row.data.perPerson, active: !!row.data.active } }
}

async function countVotes(tools: ActionTools, where: Record<string, unknown>, limit: number): Promise<number> {
  const res = await tools.query('votes', { where, limit })
  if (!res.success) throw new Error(res.error)
  return res.data.records.length
}

async function drainVotes(tools: ActionTools, boardId: string): Promise<number> {
  let total = 0
  for (;;) {
    const res = await tools.deleteWhere('votes', { boardId }, DRAIN_LIMIT)
    if (!res.success) throw new Error(res.error)
    total += res.data.deleted
    if (res.data.deleted < DRAIN_LIMIT) return total
  }
}

const voteToggle: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const input = parseToggleParams(params)
  if ('error' in input) return fail(input.error, 'bad_request')
  const { boardId, shapeId } = input
  if (!(await boardAccess(tools, userId, boardId))) return fail(DENIED, 'forbidden')

  try {
    // Only ever the caller's own votes (scoped by userId).
    for (const stale of input.staleShapeIds) await tools.deleteWhere('votes', { boardId, userId, shapeId: stale })

    const existing = await tools.query('votes', { where: { boardId, shapeId, userId }, limit: 5 })
    if (!existing.success) return fail(existing.error)
    const current = await loadRound(tools, boardId)
    const round = current?.round.active ? current.round : null

    let voted: boolean
    if (existing.data.records.length) {
      const del = await tools.deleteWhere('votes', { boardId, shapeId, userId })
      if (!del.success) return fail(del.error)
      voted = false
    } else {
      const used = await countVotes(tools, { boardId, userId }, MAX_VOTES_PER_USER + 1)
      const decision = decideAdd(used, round)
      if (!decision.ok) return fail(decision.error, decision.code)
      const res = await tools.create('votes', { boardId, shapeId, userId })
      // A concurrent identical vote hit the unique constraint: the vote is there either way.
      if (!res.success && !(await countVotes(tools, { boardId, shapeId, userId }, 1))) return fail(res.error)
      voted = true
    }

    const count = await countVotes(tools, { boardId, shapeId }, 10_000)
    const used = await countVotes(tools, { boardId, userId }, MAX_VOTES_PER_USER + 1)
    return { success: true, data: { voted, count, used, limit: round?.limit ?? null } }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

/** Load the board and require the caller to own it. */
async function requireOwner(tools: ActionTools, userId: string, boardId: unknown): Promise<string | ActionResult> {
  if (typeof boardId !== 'string' || !boardId || boardId.length > 200) return fail('Missing board.', 'bad_request')
  const access = await boardAccess(tools, userId, boardId)
  if (!access?.owner) return fail('Only the board owner can run a voting round.', 'forbidden')
  return boardId
}

const voteRoundStart: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const input = parseRoundParams(params)
  if ('error' in input) return fail(input.error, 'bad_request')
  const boardId = await requireOwner(tools, userId, input.boardId)
  if (typeof boardId !== 'string') return boardId
  try {
    const cleared = input.clear ? await drainVotes(tools, boardId) : 0
    const current = await loadRound(tools, boardId)
    const res = current
      ? await tools.update('vote_rounds', current.recordId, { perPerson: input.limit, active: true })
      : await tools.create('vote_rounds', { boardId, perPerson: input.limit, active: true })
    if (!res.success) return fail(res.error)
    return { success: true, data: { limit: input.limit, cleared } }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

const voteRoundEnd: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const boardId = await requireOwner(tools, userId, params.boardId)
  if (typeof boardId !== 'string') return boardId
  try {
    const current = await loadRound(tools, boardId)
    if (current?.round.active) {
      const res = await tools.update('vote_rounds', current.recordId, { active: false })
      if (!res.success) return fail(res.error)
    }
    return { success: true, data: { boardId } }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

const voteClear: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const boardId = await requireOwner(tools, userId, params.boardId)
  if (typeof boardId !== 'string') return boardId
  try {
    return { success: true, data: { cleared: await drainVotes(tools, boardId) } }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export const voteActions: Record<string, ActionHandler<Env>> = {
  voteToggle,
  voteRoundStart,
  voteRoundEnd,
  voteClear,
}
