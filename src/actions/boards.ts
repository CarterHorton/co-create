/**
 * Board lifecycle.
 *
 *   boardDelete → { boardId } — the owner deletes a board and everything
 *                 hanging off it: saved versions, specs, access rows
 *                 (team_members with teamId = boardId), the canvas room's
 *                 stored shapes, and live presence connections.
 *
 * Actions run with record RBAC OFF (see src/server/action-routes.ts), so the
 * handler checks ownership itself before touching anything. The board row is
 * removed last: if any step fails the board is still listed and still owned,
 * so the owner can simply delete it again and the cascade picks up where it
 * stopped.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'

const fail = (error: string, code?: string): ActionResult => ({ success: false, error, code })

const DRAIN_LIMIT = 500

/** Delete every matching row, `DRAIN_LIMIT` at a time. */
async function drain(tools: ActionTools, collection: string, where: Record<string, unknown>): Promise<number> {
  let total = 0
  for (;;) {
    const res = await tools.deleteWhere(collection, where, DRAIN_LIMIT)
    if (!res.success) throw new Error(`Could not delete ${collection}: ${res.error}`)
    total += res.data.deleted
    if (res.data.deleted < DRAIN_LIMIT) return total
  }
}

/** Wipe the board's CanvasRoom storage via its internal-only route (see worker.ts). */
async function clearCanvas(env: Env, boardId: string): Promise<void> {
  const stub = env.CANVAS_ROOMS.get(env.CANVAS_ROOMS.idFromName(boardId))
  const res = await stub.fetch(new Request('https://internal/internal/clear-canvas', { method: 'POST' }))
  if (!res.ok) throw new Error(`Could not clear the canvas (${res.status})`)
}

/** Close everyone's presence socket on the board; they reconnect into a 403. */
async function disconnectPresence(env: Env, boardId: string): Promise<void> {
  const stub = env.PRESENCE_ROOMS.get(env.PRESENCE_ROOMS.idFromName(`board:${boardId}`))
  await stub.fetch(
    new Request('https://internal/internal/disconnect-sockets', {
      method: 'POST',
      body: JSON.stringify({ reason: 'board-deleted' }),
    }),
  )
}

const boardDelete: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const boardId = params.boardId
  if (typeof boardId !== 'string' || !boardId) return fail('Missing board.', 'bad_request')
  const res = await tools.get<{ ownerId?: string }>('boards', boardId)
  // Same answer for "missing" and "not yours": don't reveal which boards exist.
  if (!res.success || res.data.record.data.ownerId !== userId) {
    return fail('Only the board owner can delete it.', 'forbidden')
  }

  try {
    const versions = await drain(tools, 'versions', { boardId })
    const specs = await drain(tools, 'specs', { boardId })
    const comments = await drain(tools, 'comments', { boardId })
    await drain(tools, 'mentions', { boardId })
    // Access rows go after the content they guard and before the board row,
    // so a retry still finds the board and its owner.
    const members = await drain(tools, 'team_members', { teamId: boardId })
    await clearCanvas(env, boardId)
    // Best effort: presence is in-memory only and gated on the board existing.
    await disconnectPresence(env, boardId).catch(() => undefined)

    const removed = await tools.remove('boards', boardId)
    if (!removed.success) return fail(removed.error)
    return { success: true, data: { boardId, versions, specs, members, comments } }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export const boardActions: Record<string, ActionHandler<Env>> = {
  boardDelete,
}
