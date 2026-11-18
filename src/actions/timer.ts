/**
 * Shared board timer (src/timer). One `board_timers` row per board, written
 * only here so its times come from the server's clock and only people who may
 * edit the board can control it.
 *
 *   timerSync    → { boardId }                        — { now, canControl, timer }
 *   timerControl → { boardId, op, durationMs? }       — { now, canControl, timer }
 *                  op: start (durationMs, 10 s – 2 h) | pause | resume | add (+1 min) | reset
 *
 * Both answer with the server's `now`, which clients use to work out their
 * clock offset (see estimateOffset in src/timer/timerMath.ts).
 *
 * Actions run with record RBAC OFF (see src/server/action-routes.ts), so the
 * access checks here are the only checks. Board access = owner, or an active
 * team_members row. Viewers (users.role 'viewer', or a board-level 'viewer'
 * role) can sync but not control.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { applyOp, toTimerState, TIMER_OPS, type TimerOp, type TimerState } from '../timer/timerMath'

const fail = (error: string, code?: string): ActionResult => ({ success: false, error, code })

/** The board's single timer row. */
export function timerRecordId(boardId: string): string {
  return `timer-${boardId}`
}

type Access = { canControl: boolean; name: string }

/** Owner or active member → access; null when the caller can't open the board (or it doesn't exist). */
async function boardAccess(tools: ActionTools, userId: string, boardId: string): Promise<Access | null> {
  const board = await tools.get<{ ownerId?: string }>('boards', boardId)
  if (!board.success) return null
  const userRes = await tools.get<{ name?: string; email?: string; role?: string }>('users', userId)
  const user = userRes.success ? userRes.data.record.data : null
  const name = user?.name || user?.email || 'Someone'
  const globalViewer = user?.role === 'viewer'

  if (board.data.record.data.ownerId === userId) return { canControl: !globalViewer, name }
  const res = await tools.query<{ status?: string; role?: string }>('team_members', {
    where: { teamId: boardId, userId },
    limit: 5,
  })
  if (!res.success) return null
  const row = res.data.records.find((r) => !r.data.status || r.data.status === 'active')
  if (!row) return null
  return { canControl: !globalViewer && row.data.role !== 'viewer', name }
}

function checkBoardId(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() && raw.length <= 200 ? raw : null
}

async function loadTimer(tools: ActionTools, boardId: string): Promise<{ state: TimerState; exists: boolean }> {
  const res = await tools.get<Record<string, unknown>>('board_timers', timerRecordId(boardId))
  if (!res.success) return { state: toTimerState(null), exists: false }
  return { state: toTimerState(res.data.record.data), exists: true }
}

const DENIED = 'Board not found or you do not have access to it.'

const timerSync: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const boardId = checkBoardId(params.boardId)
  if (!boardId) return fail('Missing board.', 'bad_request')
  const access = await boardAccess(tools, userId, boardId)
  if (!access) return fail(DENIED, 'forbidden')
  const { state } = await loadTimer(tools, boardId)
  return { success: true, data: { now: Date.now(), canControl: access.canControl, timer: state } }
}

const timerControl: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const boardId = checkBoardId(params.boardId)
  if (!boardId) return fail('Missing board.', 'bad_request')
  const op = params.op
  if (typeof op !== 'string' || !TIMER_OPS.includes(op as TimerOp)) return fail('Unknown timer action.', 'bad_request')
  if (params.durationMs !== undefined && typeof params.durationMs !== 'number') {
    return fail('Invalid duration.', 'bad_request')
  }

  const access = await boardAccess(tools, userId, boardId)
  if (!access) return fail(DENIED, 'forbidden')
  if (!access.canControl) return fail('Only editors can control the timer.', 'forbidden')

  const { state, exists } = await loadTimer(tools, boardId)
  const now = Date.now()
  const next = applyOp(state, op as TimerOp, now, access.name, params.durationMs as number | undefined)
  if ('error' in next) return fail(next.error, 'bad_request')

  const row = {
    status: next.status,
    durationMs: next.durationMs,
    endsAt: next.endsAt,
    pausedRemainingMs: next.pausedRemainingMs,
    actorName: next.actorName,
    lastOp: next.lastOp,
    rev: next.rev,
    ...(op === 'start' ? { startedBy: userId } : {}),
  }
  const id = timerRecordId(boardId)
  const res = exists ? await tools.update('board_timers', id, row) : await tools.create('board_timers', { boardId, ...row }, id)
  if (!res.success) return fail(res.error)
  return { success: true, data: { now, canControl: true, timer: next } }
}

export const timerActions: Record<string, ActionHandler<Env>> = {
  timerSync,
  timerControl,
}
