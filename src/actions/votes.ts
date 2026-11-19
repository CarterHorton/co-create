/**
 * Vote panels on sticky notes. Actions run with record RBAC OFF (see
 * src/server/action-routes.ts), so every check here is the only check.
 *
 *   votePanelOpen      → { boardId, shapeIds, perPerson? } — open a vote on the
 *                        selected notes. Anyone who can edit the board; one open
 *                        panel per board (a stale one is closed first).
 *   voteToggle         → { panelId, shapeId } — add or remove the caller's vote.
 *                        Anyone who can open the board, viewers included; only
 *                        notes in the panel, only while it's open, and at most
 *                        `perPerson` votes each.
 *   votePanelHeartbeat → { panelId } — the opener's client, while it's open.
 *   votePanelClose     → { panelId, leaving? } — the opener closes it (or their
 *                        page is closing: `leaving`), finalizing the
 *                        results; anyone on the board may close it once the
 *                        opener's heartbeat has stopped (they left).
 *
 * Votes are created as the caller, so `createdBy` = `userId` = the voter.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  decideAdd,
  decideClose,
  isStale,
  panelShapeIds,
  parseOpenParams,
  parsePanelParams,
  parseToggleParams,
  type CloseReason,
  type PanelRow,
} from '../votes/logic'

const fail = (error: string, code?: string): ActionResult => ({ success: false, error, code })
const DENIED = 'Board not found or you do not have access to it.'
const GONE = 'That vote no longer exists.'

/** Owner, or an active team_members row (viewers can't edit). Missing and forbidden boards get the same answer. */
async function boardAccess(tools: ActionTools, userId: string, boardId: string): Promise<{ canEdit: boolean } | null> {
  const board = await tools.get<{ ownerId?: string }>('boards', boardId)
  if (!board.success) return null
  if (board.data.record.data.ownerId === userId) return { canEdit: true }
  const res = await tools.query<{ status?: string; role?: string }>('team_members', { where: { teamId: boardId, userId }, limit: 5 })
  if (!res.success) return null
  const row = res.data.records.find((r) => !r.data.status || r.data.status === 'active')
  return row ? { canEdit: row.data.role !== 'viewer' } : null
}

async function userName(tools: ActionTools, userId: string): Promise<string> {
  const res = await tools.get<{ name?: string; email?: string }>('users', userId)
  if (!res.success) return ''
  return res.data.record.data.name || res.data.record.data.email || ''
}

type Loaded = { id: string; panel: PanelRow }

/** Load a panel and require the caller to be on its board. */
async function loadPanel(tools: ActionTools, userId: string, panelId: string): Promise<Loaded | ActionResult> {
  const res = await tools.get<PanelRow>('vote_panels', panelId)
  if (!res.success) return fail(GONE, 'not_found')
  const panel = res.data.record.data
  if (!(await boardAccess(tools, userId, panel.boardId))) return fail(DENIED, 'forbidden')
  return { id: panelId, panel }
}

async function countVotes(tools: ActionTools, where: Record<string, unknown>): Promise<number> {
  const res = await tools.query('votes', { where, limit: 1000 })
  if (!res.success) throw new Error(res.error)
  return res.data.records.length
}

/** Freeze a panel's counts and close it. */
async function finalize(tools: ActionTools, id: string, panel: PanelRow, reason: CloseReason, now: number) {
  const res = await tools.query<{ shapeId: string; userId: string }>('votes', { where: { panelId: id }, limit: 1000 })
  if (!res.success) throw new Error(res.error)
  const allowed = new Set(panelShapeIds(panel))
  const voters = new Map<string, Set<string>>()
  for (const r of res.data.records) {
    if (!allowed.has(r.data.shapeId)) continue
    if (!voters.has(r.data.shapeId)) voters.set(r.data.shapeId, new Set())
    voters.get(r.data.shapeId)!.add(r.data.userId)
  }
  const results = Object.fromEntries([...voters].map(([k, v]) => [k, v.size]))
  const up = await tools.update('vote_panels', id, { status: 'closed', closedAt: now, closeReason: reason, results: JSON.stringify(results) })
  if (!up.success) throw new Error(up.error)
  return results
}

const votePanelOpen: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const input = parseOpenParams(params)
  if ('error' in input) return fail(input.error, 'bad_request')
  const access = await boardAccess(tools, userId, input.boardId)
  if (!access) return fail(DENIED, 'forbidden')
  if (!access.canEdit) return fail('Only people who can edit this board can open a vote.', 'forbidden')

  try {
    const now = Date.now()
    const open = await tools.query<PanelRow>('vote_panels', { where: { boardId: input.boardId, status: 'open' }, limit: 20 })
    if (!open.success) return fail(open.error)
    for (const r of open.data.records) {
      // Someone whose opener is gone doesn't block a new vote.
      if (isStale(r.data.heartbeatAt, now)) await finalize(tools, r.recordId, r.data, 'opener-left', now)
      else return fail(`${r.data.openedByName || 'Someone'} already has a vote open on this board.`, 'conflict')
    }
    const created = await tools.create('vote_panels', {
      boardId: input.boardId,
      openedBy: userId,
      openedByName: (await userName(tools, userId)).slice(0, 200),
      shapeIds: JSON.stringify(input.shapeIds),
      perPerson: input.perPerson,
      status: 'open',
      openedAt: now,
      heartbeatAt: now,
    })
    if (!created.success) return fail(created.error)
    const panelId = created.data.recordId

    // Two people opening at the same moment: the earlier one wins, the later one backs out.
    const again = await tools.query<PanelRow>('vote_panels', { where: { boardId: input.boardId, status: 'open' }, limit: 20 })
    if (again.success && again.data.records.length > 1) {
      const first = [...again.data.records].sort((a, b) => a.data.openedAt - b.data.openedAt || a.recordId.localeCompare(b.recordId))[0]
      if (first.recordId !== panelId) {
        await tools.remove('vote_panels', panelId)
        return fail(`${first.data.openedByName || 'Someone'} already has a vote open on this board.`, 'conflict')
      }
    }
    return { success: true, data: { panelId } }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

const voteToggle: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const input = parseToggleParams(params)
  if ('error' in input) return fail(input.error, 'bad_request')
  const loaded = await loadPanel(tools, userId, input.panelId)
  if (!('panel' in loaded)) return loaded
  const { id, panel } = loaded
  if (panel.status !== 'open') return fail('This vote is closed.', 'conflict')
  if (!panelShapeIds(panel).includes(input.shapeId)) return fail("That note isn't in this vote.", 'bad_request')

  try {
    const mine = { panelId: id, shapeId: input.shapeId, userId }
    const existing = await countVotes(tools, mine)
    let voted: boolean
    if (existing) {
      const del = await tools.deleteWhere('votes', mine)
      if (!del.success) return fail(del.error)
      voted = false
    } else {
      const decision = decideAdd(await countVotes(tools, { panelId: id, userId }), panel.perPerson)
      if (!decision.ok) return fail(decision.error, decision.code)
      const res = await tools.create('votes', { boardId: panel.boardId, ...mine })
      // A concurrent identical vote hit the unique constraint: the vote is there either way.
      if (!res.success && !(await countVotes(tools, mine))) return fail(res.error)
      voted = true
    }
    const count = await countVotes(tools, { panelId: id, shapeId: input.shapeId })
    const used = await countVotes(tools, { panelId: id, userId })
    return { success: true, data: { voted, count, used, limit: panel.perPerson } }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

const votePanelHeartbeat: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const input = parsePanelParams(params)
  if ('error' in input) return fail(input.error, 'bad_request')
  const loaded = await loadPanel(tools, userId, input.panelId)
  if (!('panel' in loaded)) return loaded
  if (loaded.panel.openedBy !== userId) return fail('Only the person who opened this vote keeps it open.', 'forbidden')
  if (loaded.panel.status !== 'open') return { success: true, data: { open: false } }
  const res = await tools.update('vote_panels', loaded.id, { heartbeatAt: Date.now() })
  if (!res.success) return fail(res.error)
  return { success: true, data: { open: true } }
}

const votePanelClose: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const input = parsePanelParams(params)
  if ('error' in input) return fail(input.error, 'bad_request')
  const loaded = await loadPanel(tools, userId, input.panelId)
  if (!('panel' in loaded)) return loaded
  const now = Date.now()
  const decision = decideClose(loaded.panel, userId, now, input.leaving)
  if (!decision.ok) return fail(decision.error, decision.code)
  try {
    const results = await finalize(tools, loaded.id, loaded.panel, decision.reason, now)
    return { success: true, data: { results, reason: decision.reason } }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export const voteActions: Record<string, ActionHandler<Env>> = {
  votePanelOpen,
  voteToggle,
  votePanelHeartbeat,
  votePanelClose,
}
