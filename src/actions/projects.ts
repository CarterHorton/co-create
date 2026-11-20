/**
 * Projects (folders for boards), archiving, and sharing a whole project.
 *
 * Actions run with record RBAC OFF (see src/server/action-routes.ts), so every
 * handler checks ownership itself before writing.
 *
 *   projectCreate  → { name }                  — a new project for the caller
 *   projectRename  → { projectId, name }       — owner renames it
 *   projectDelete  → { projectId }             — owner deletes it; its boards stay,
 *                                                unassigned, and the access the
 *                                                project granted is revoked
 *   boardMove      → { boardId, projectId }    — owner files a board ('' = none);
 *                                                it gains the new project's members
 *                                                and loses the old project's grants
 *   boardArchive   → { boardId, archived }     — owner archives / restores a board
 *   projectShare   → { projectId, friendId }   — owner shares every board in the
 *                                                project with a friend (editor)
 *   projectUnshare → { projectId, userId }     — owner takes that access back
 *
 * Access a project share creates is recorded in `project_grants`, so revoking it
 * never removes access the owner gave directly with `boardShare`.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { appOrigin, sendNotice } from '../email/notify'
import { MAX_PROJECT_NAME_LENGTH } from '../schemas/projects-schema'
import { addMember, areFriends, queryAll, touchBoard, type BoardRow, type Row, type TeamMember } from './sharing'

/** At most this many projects per person. */
export const MAX_PROJECTS = 200
/** Boards handled per project in one action. */
const BOARD_LIMIT = 500

type ProjectRow = { name: string; ownerId: string }
type ProjectMember = { projectId: string; ownerId: string; userId: string; name?: string }
type Grant = { projectId: string; boardId: string; userId: string }
type Board = BoardRow & { projectId?: string; archived?: boolean | number }

const fail = (error: string, code?: string): ActionResult => ({ success: false, error, code })

type Invalid = { error: string }

/** Validate a project name. Pure, so it can be unit tested. */
export function parseProjectName(raw: unknown): string | Invalid {
  if (typeof raw !== 'string') return { error: 'A project needs a name.' }
  const name = raw.replace(/\s+/g, ' ').trim()
  if (!name) return { error: 'A project needs a name.' }
  if (name.length > MAX_PROJECT_NAME_LENGTH) {
    return { error: `Project names are at most ${MAX_PROJECT_NAME_LENGTH} characters.` }
  }
  return name
}

/** Validate a record id param. Pure, so it can be unit tested. */
export function parseId(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() && raw.length <= 200 ? raw : null
}

async function loadOwnedProject(
  tools: ActionTools,
  userId: string,
  projectId: unknown,
): Promise<Row<ProjectRow> | ActionResult> {
  const id = parseId(projectId)
  if (!id) return fail('Missing project.', 'bad_request')
  const res = await tools.get<ProjectRow>('projects', id)
  // Same answer for "missing" and "not yours".
  if (!res.success || res.data.record.data.ownerId !== userId) {
    return fail('Only the project owner can change it.', 'forbidden')
  }
  return { ...res.data.record, recordId: id } as Row<ProjectRow>
}

async function loadBoardForOwner(tools: ActionTools, userId: string, boardId: unknown): Promise<Row<Board> | ActionResult> {
  const id = parseId(boardId)
  if (!id) return fail('Missing board.', 'bad_request')
  const res = await tools.get<Board>('boards', id)
  if (!res.success || res.data.record.data.ownerId !== userId) {
    return fail('Only the board owner can do that.', 'forbidden')
  }
  return { ...res.data.record, recordId: id } as Row<Board>
}

const isResult = (v: object): v is ActionResult => 'success' in v

async function projectBoards(tools: ActionTools, ownerId: string, projectId: string): Promise<Row<Board>[]> {
  return queryAll<Board>(tools, 'boards', { ownerId, projectId }, BOARD_LIMIT)
}

/** Give `memberId` editor access to `board` on behalf of the project, unless they already have access. */
async function grantBoard(tools: ActionTools, board: Row<Board>, projectId: string, memberId: string) {
  if (memberId === board.data.ownerId) return
  const existing = await queryAll<TeamMember>(tools, 'team_members', { teamId: board.recordId, userId: memberId }, 1)
  // Already on the board (sent directly, or by this project before): not ours to revoke later.
  if (existing.length) return
  await addMember(tools, board.recordId, board.data.ownerId, 'owner')
  await addMember(tools, board.recordId, memberId, 'editor')
  const prior = await queryAll<Grant>(tools, 'project_grants', { projectId, boardId: board.recordId, userId: memberId }, 1)
  if (!prior.length) {
    const res = await tools.create('project_grants', { projectId, boardId: board.recordId, userId: memberId })
    if (!res.success) throw new Error(res.error)
  }
  await touchBoard(tools, board)
}

/** Remove the access rows a project created on `board` (optionally only for one person). */
async function revokeBoardGrants(tools: ActionTools, board: Row<Board>, projectId: string, memberId?: string) {
  const where: Record<string, unknown> = { projectId, boardId: board.recordId }
  if (memberId) where.userId = memberId
  const grants = await queryAll<Grant>(tools, 'project_grants', where, 500)
  if (!grants.length) return
  for (const g of grants) {
    const del = await tools.deleteWhere('team_members', { teamId: board.recordId, userId: g.data.userId })
    if (!del.success) throw new Error(del.error)
  }
  const del = await tools.deleteWhere('project_grants', where, 500)
  if (!del.success) throw new Error(del.error)
  await touchBoard(tools, board)
}

/** The project's members who are still the owner's friends (unfriending ends sharing). */
async function activeMembers(tools: ActionTools, project: Row<ProjectRow>): Promise<Row<ProjectMember>[]> {
  const members = await queryAll<ProjectMember>(tools, 'project_members', { projectId: project.recordId }, 200)
  const out: Row<ProjectMember>[] = []
  for (const m of members) {
    if (await areFriends(tools, project.data.ownerId, m.data.userId)) out.push(m)
  }
  return out
}

/**
 * Remove a board's pins and project grants. Called from `boardDelete`'s
 * cascade (src/actions/boards.ts) before the board's access rows go.
 */
export async function drainBoardProjectData(tools: ActionTools, boardId: string): Promise<void> {
  for (const collection of ['board_pins', 'project_grants']) {
    for (;;) {
      const res = await tools.deleteWhere(collection, { boardId }, 500)
      if (!res.success) throw new Error(`Could not delete ${collection}: ${res.error}`)
      if (res.data.deleted < 500) break
    }
  }
}

async function run(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn()
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

const projectCreate: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const name = parseProjectName(params.name)
  if (typeof name !== 'string') return fail(name.error, 'bad_request')
  const mine = await queryAll<ProjectRow>(tools, 'projects', { ownerId: userId }, MAX_PROJECTS)
  if (mine.length >= MAX_PROJECTS) return fail(`You can have at most ${MAX_PROJECTS} projects.`, 'limit')
  const res = await tools.create('projects', { name, ownerId: userId })
  if (!res.success) return fail(res.error)
  return { success: true, data: { projectId: res.data.recordId, name } }
}

const projectRename: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const project = await loadOwnedProject(tools, userId, params.projectId)
  if (isResult(project)) return project
  const name = parseProjectName(params.name)
  if (typeof name !== 'string') return fail(name.error, 'bad_request')
  const res = await tools.update('projects', project.recordId, { name })
  if (!res.success) return fail(res.error)
  return { success: true, data: { projectId: project.recordId, name } }
}

const projectDelete: ActionHandler<Env> = ({ userId, params, tools }) =>
  run(async () => {
    const project = await loadOwnedProject(tools, userId, params.projectId)
    if (isResult(project)) return project
    const boards = await projectBoards(tools, userId, project.recordId)
    for (const board of boards) {
      await revokeBoardGrants(tools, board, project.recordId)
      const res = await tools.update('boards', board.recordId, { projectId: '' })
      if (!res.success) throw new Error(res.error)
    }
    // Grants on boards no longer in the project were dropped when they moved out.
    await tools.deleteWhere('project_grants', { projectId: project.recordId }, 500)
    const members = await tools.deleteWhere('project_members', { projectId: project.recordId }, 500)
    if (!members.success) throw new Error(members.error)
    const removed = await tools.remove('projects', project.recordId)
    if (!removed.success) return fail(removed.error)
    return { success: true, data: { projectId: project.recordId, boards: boards.length } }
  })

const boardMove: ActionHandler<Env> = ({ userId, params, tools }) =>
  run(async () => {
    const board = await loadBoardForOwner(tools, userId, params.boardId)
    if (isResult(board)) return board
    let target: Row<ProjectRow> | null = null
    if (params.projectId !== '' && params.projectId !== null && params.projectId !== undefined) {
      const p = await loadOwnedProject(tools, userId, params.projectId)
      if (isResult(p)) return p
      target = p
    }
    const from = board.data.projectId || ''
    const to = target?.recordId ?? ''
    if (from === to) return { success: true, data: { boardId: board.recordId, projectId: to } }

    if (from) await revokeBoardGrants(tools, board, from)
    const res = await tools.update('boards', board.recordId, { projectId: to })
    if (!res.success) return fail(res.error)
    if (target) {
      for (const m of await activeMembers(tools, target)) {
        await grantBoard(tools, board, target.recordId, m.data.userId)
      }
    }
    return { success: true, data: { boardId: board.recordId, projectId: to } }
  })

const boardArchive: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const board = await loadBoardForOwner(tools, userId, params.boardId)
  if (isResult(board)) return board
  if (typeof params.archived !== 'boolean') return fail('Invalid archived flag.', 'bad_request')
  const res = await tools.update('boards', board.recordId, { archived: params.archived })
  if (!res.success) return fail(res.error)
  return { success: true, data: { boardId: board.recordId, archived: params.archived } }
}

const projectShare: ActionHandler<Env> = ({ userId, params, tools, env }) =>
  run(async () => {
    const project = await loadOwnedProject(tools, userId, params.projectId)
    if (isResult(project)) return project
    const friendId = parseId(params.friendId)
    if (!friendId) return fail('Missing friend.', 'bad_request')
    if (friendId === userId) return fail('You already have this project.', 'bad_request')
    if (!(await areFriends(tools, userId, friendId))) {
      return fail('You can only share projects with people in your party.', 'not_friends')
    }
    const existing = await queryAll<ProjectMember>(
      tools,
      'project_members',
      { projectId: project.recordId, userId: friendId },
      1,
    )
    if (!existing.length) {
      const friend = await queryAll<{ friendName?: string }>(tools, 'friendships', { ownerId: userId, friendId }, 1)
      const res = await tools.create('project_members', {
        projectId: project.recordId,
        ownerId: userId,
        userId: friendId,
        name: friend[0]?.data.friendName || 'Someone',
      })
      if (!res.success) return fail(res.error)
    }
    const boards = await projectBoards(tools, userId, project.recordId)
    for (const board of boards) await grantBoard(tools, board, project.recordId, friendId)
    if (!existing.length) {
      const me = await tools.get<{ name?: string; email?: string }>('users', userId)
      const fromName = me.success ? me.data.record.data.name || me.data.record.data.email || 'Someone' : 'Someone'
      await sendNotice(tools, {
        senderId: userId,
        recipientId: friendId,
        origin: appOrigin(env),
        notice: { kind: 'project', fromName, projectName: String(project.data.name ?? ''), boards: boards.length },
      })
    }
    return { success: true, data: { projectId: project.recordId, userId: friendId, boards: boards.length } }
  })

const projectUnshare: ActionHandler<Env> = ({ userId, params, tools }) =>
  run(async () => {
    const project = await loadOwnedProject(tools, userId, params.projectId)
    if (isResult(project)) return project
    const memberId = parseId(params.userId)
    if (!memberId) return fail('Missing person.', 'bad_request')
    const grants = await queryAll<Grant>(tools, 'project_grants', { projectId: project.recordId, userId: memberId }, 500)
    for (const boardId of new Set(grants.map((g) => g.data.boardId))) {
      const res = await tools.get<Board>('boards', boardId)
      if (!res.success || res.data.record.data.ownerId !== userId) continue
      await revokeBoardGrants(tools, { ...res.data.record, recordId: boardId } as Row<Board>, project.recordId, memberId)
    }
    await tools.deleteWhere('project_grants', { projectId: project.recordId, userId: memberId }, 500)
    const del = await tools.deleteWhere('project_members', { projectId: project.recordId, userId: memberId })
    if (!del.success) return fail(del.error)
    return { success: true, data: { projectId: project.recordId, userId: memberId } }
  })

export const projectActions: Record<string, ActionHandler<Env>> = {
  projectCreate,
  projectRename,
  projectDelete,
  boardMove,
  boardArchive,
  projectShare,
  projectUnshare,
}
