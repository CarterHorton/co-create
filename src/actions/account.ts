/**
 * Self-serve account deletion.
 *
 *   accountDelete → { confirm: 'DELETE' } — removes everything Co-Create
 *                   stores about the caller. Answers `{ done, boards }`;
 *                   while `done` is false the client calls again.
 *
 * What goes:
 *   - every board the caller owns, with its whole cascade (deleteBoardCascade:
 *     history, specs, comments, votes, timers, links, access rows, canvas);
 *   - their projects, project shares and board pins;
 *   - their access to other people's boards and projects;
 *   - friendships (both directions), friend codes and rate-limit attempts
 *     (GitHub lookups included); repo links live on their boards and
 *     projects, so they go with them;
 *   - what they created on other people's boards: comments (a root comment
 *     takes its thread with it, as in commentDelete), votes and vote panels
 *     they opened, saved versions and published specs;
 *   - @mention notifications to or from them;
 *   - their `users` row (name, email, picture).
 *
 * What stays: shapes they drew on someone else's canvas are part of that
 * owner's board. Their DeepSpace sign-in identity is managed by DeepSpace and
 * is shared across DeepSpace apps, so the app cannot delete it; signing in
 * again starts a new, empty Co-Create account.
 *
 * Work is capped per call (BOARDS_PER_CALL, ROWS_PER_CALL) so one request
 * stays inside the Workers subrequest budget. Every step is idempotent and the
 * users row goes last, so an interrupted or failed run is finished by calling
 * again.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { deleteBoardCascade, drain } from './boards'
import { queryAll, touchBoard } from './sharing'

const fail = (error: string, code?: string): ActionResult => ({ success: false, error, code })

export const CONFIRM_WORD = 'DELETE'
/** Owned boards deleted per call; each is a cascade of ~15 subrequests. */
export const BOARDS_PER_CALL = 5
/** Per-row steps (comment threads, vote panels, memberships) per call. */
export const ROWS_PER_CALL = 20

interface Ctx {
  tools: ActionTools
  env: Env
  userId: string
}

/** False when the step hit its cap and there is more to do next call. */
type Step = (ctx: Ctx) => Promise<boolean>

const ownedBoards: Step = async ({ tools, env, userId }) => {
  const boards = await queryAll<{ ownerId: string }>(tools, 'boards', { ownerId: userId }, BOARDS_PER_CALL)
  for (const board of boards) {
    // Re-checked per row: the query filters on ownerId, but deletion is not
    // the place to trust a filter.
    if (board.data.ownerId !== userId) continue
    await deleteBoardCascade(tools, env, board.recordId)
  }
  return boards.length < BOARDS_PER_CALL
}

const ownedProjects: Step = async ({ tools, userId }) => {
  const projects = await queryAll<{ ownerId: string }>(tools, 'projects', { ownerId: userId }, ROWS_PER_CALL)
  for (const project of projects) {
    if (project.data.ownerId !== userId) continue
    await drain(tools, 'project_grants', { projectId: project.recordId })
    await drain(tools, 'project_members', { projectId: project.recordId })
    const res = await tools.remove('projects', project.recordId)
    if (!res.success) throw new Error(res.error)
  }
  return projects.length < ROWS_PER_CALL
}

/** Their access to other people's boards; each board is re-saved so open lists drop it. */
const memberships: Step = async ({ tools, userId }) => {
  await drain(tools, 'project_grants', { userId })
  await drain(tools, 'project_members', { userId })
  const rows = await queryAll<{ teamId: string }>(tools, 'team_members', { userId }, ROWS_PER_CALL)
  for (const boardId of new Set(rows.map((r) => r.data.teamId))) {
    await drain(tools, 'team_members', { teamId: boardId, userId })
    const board = await tools.get<{ accessVersion?: number }>('boards', boardId)
    if (board.success) await touchBoard(tools, { ...board.data.record, recordId: boardId } as never)
  }
  return rows.length < ROWS_PER_CALL
}

const social: Step = async ({ tools, userId }) => {
  await drain(tools, 'friendships', { ownerId: userId })
  await drain(tools, 'friendships', { friendId: userId })
  await drain(tools, 'friend_codes', { ownerId: userId })
  await drain(tools, 'friend_code_attempts', { userId })
  await drain(tools, 'board_link_attempts', { userId })
  await drain(tools, 'github_calls', { userId })
  await drain(tools, 'board_links', { ownerId: userId })
  await drain(tools, 'board_pins', { ownerId: userId })
  // Email: their unsubscribe token and send log. The no-email list keeps only a hash of the
  // address, not the address, and stays so an unsubscribe still holds if they come back.
  await drain(tools, 'email_prefs', { userId })
  await drain(tools, 'email_log', { senderId: userId })
  return true
}

/** Comments they wrote on other people's boards. */
const comments: Step = async ({ tools, userId }) => {
  const rows = await queryAll<{ boardId: string; parentId?: string }>(tools, 'comments', { authorId: userId }, ROWS_PER_CALL)
  for (const c of rows) {
    const boardId = c.data.boardId
    if (!c.data.parentId) {
      // A thread goes with its root, replies and notifications included.
      await drain(tools, 'comments', { boardId, parentId: c.recordId })
      await drain(tools, 'mentions', { boardId, threadId: c.recordId })
    } else {
      await drain(tools, 'mentions', { boardId, commentId: c.recordId })
    }
    const res = await tools.remove('comments', c.recordId)
    // Already gone (a reply removed with its thread above) is fine.
    if (!res.success && !/not found/i.test(res.error)) throw new Error(res.error)
  }
  if (rows.length >= ROWS_PER_CALL) return false
  await drain(tools, 'mentions', { userId })
  await drain(tools, 'mentions', { createdBy: userId })
  return true
}

/** Votes they cast, and vote panels they opened (with everyone's votes in them). */
const votes: Step = async ({ tools, userId }) => {
  const panels = await queryAll(tools, 'vote_panels', { openedBy: userId }, ROWS_PER_CALL)
  for (const panel of panels) {
    await drain(tools, 'votes', { panelId: panel.recordId })
    const res = await tools.remove('vote_panels', panel.recordId)
    if (!res.success && !/not found/i.test(res.error)) throw new Error(res.error)
  }
  if (panels.length >= ROWS_PER_CALL) return false
  await drain(tools, 'votes', { userId })
  return true
}

/** History versions and specs they saved on other people's boards. */
const history: Step = async ({ tools, userId }) => {
  await drain(tools, 'versions', { createdBy: userId })
  await drain(tools, 'specs', { createdBy: userId })
  return true
}

const profile: Step = async ({ tools, userId }) => {
  const res = await tools.remove('users', userId)
  if (!res.success && !/not found/i.test(res.error)) throw new Error(res.error)
  return true
}

/** In order; the profile goes last so a retry still runs as a known user. */
export const STEPS: Step[] = [ownedBoards, ownedProjects, memberships, social, comments, votes, history, profile]

/** Run steps until one is capped. Exported for tests. */
export async function runAccountDeletion(ctx: Ctx): Promise<{ done: boolean }> {
  for (const step of STEPS) {
    if (!(await step(ctx))) return { done: false }
  }
  return { done: true }
}

const accountDelete: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  if (params.confirm !== CONFIRM_WORD) return fail(`Type ${CONFIRM_WORD} to confirm.`, 'bad_request')
  try {
    return { success: true, data: await runAccountDeletion({ tools, env, userId }) }
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

export const accountActions: Record<string, ActionHandler<Env>> = {
  accountDelete,
}
