/**
 * Connect a public GitHub repository to a board or a project.
 *
 * Actions run with record RBAC OFF (see src/server/action-routes.ts), so every
 * handler checks ownership itself before writing.
 *
 *   repoConnect    → { target: 'board'|'project', id, repo }
 *                    owner only. `repo` is "owner/name" or a github.com link.
 *                    Looks it up with `github/get-repository` (billed to the
 *                    app owner, rate limited per user) and stores its public
 *                    metadata. Connecting the same repo again refreshes it.
 *   repoDisconnect → { target: 'board'|'project', id } — owner only.
 *
 * A project's repo waterfalls: every board in the project gets a copy in
 * `boards.projectRepo` and uses it unless it has its own `boards.repo`
 * (src/github/repo.ts). boardMove / projectDelete (src/actions/projects.ts)
 * keep that copy in step when a board changes project.
 *
 * Nothing about a repo is fetched again later: the spec export reads what was
 * stored here.
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  LOOKUP_RETENTION_MS,
  lookupAllowed,
  lookupFailure,
  parseRepoInput,
  repoFromApi,
  serializeRepo,
  type RepoInfo,
} from '../github/repo'
import { queryAll, type Row } from './sharing'

/** Boards updated per project in one action (matches projects.ts). */
const BOARD_LIMIT = 500

type Target = 'board' | 'project'
type Owned = { ownerId: string; projectId?: string; repo?: string }

const fail = (error: string, code?: string): ActionResult => ({ success: false, error, code })

function parseTarget(raw: unknown): Target | null {
  return raw === 'board' || raw === 'project' ? raw : null
}

/** The board or project, if `userId` owns it. Same answer for "missing" and "not yours". */
async function loadOwned(tools: ActionTools, userId: string, target: Target, id: unknown): Promise<Row<Owned> | ActionResult> {
  if (typeof id !== 'string' || !id.trim() || id.length > 200) return fail(`Missing ${target}.`, 'bad_request')
  const res = await tools.get<Owned>(target === 'board' ? 'boards' : 'projects', id)
  if (!res.success || res.data.record.data.ownerId !== userId) {
    return fail(`Only the ${target} owner can connect a repository.`, 'forbidden')
  }
  return { ...res.data.record, recordId: id } as Row<Owned>
}

const isResult = (v: object): v is ActionResult => 'success' in v

/** Count this lookup against the caller's limit, or refuse it. Prunes old rows as it goes. */
async function takeLookup(tools: ActionTools, userId: string, now: number): Promise<ActionResult | null> {
  const rows = await queryAll<{ userId: string; at: number }>(tools, 'github_calls', { userId }, 200)
  const allowed = lookupAllowed(
    rows.map((r) => r.data.at),
    now,
  )
  if (!allowed.ok) return fail(allowed.error, 'rate_limited')
  for (const old of rows.filter((r) => r.data.at <= now - LOOKUP_RETENTION_MS).slice(0, 20)) {
    await tools.remove('github_calls', old.recordId)
  }
  const res = await tools.create('github_calls', { userId, at: now })
  if (!res.success) throw new Error(res.error)
  return null
}

/** Copy the project's repo onto every board of its owner's in the project. */
async function waterfall(tools: ActionTools, ownerId: string, projectId: string, repo: string) {
  const boards = await queryAll<Owned & { projectRepo?: string }>(tools, 'boards', { ownerId, projectId }, BOARD_LIMIT)
  for (const b of boards) {
    if (b.data.ownerId !== ownerId || (b.data.projectRepo ?? '') === repo) continue
    const res = await tools.update('boards', b.recordId, { projectRepo: repo })
    if (!res.success) throw new Error(res.error)
  }
  return boards.length
}

async function store(tools: ActionTools, target: Target, row: Row<Owned>, repo: string) {
  const res = await tools.update(target === 'board' ? 'boards' : 'projects', row.recordId, { repo })
  if (!res.success) throw new Error(res.error)
  if (target === 'project') await waterfall(tools, row.data.ownerId, row.recordId, repo)
}

async function run(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn()
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
}

const repoConnect: ActionHandler<Env> = ({ userId, params, tools }) =>
  run(async () => {
    const target = parseTarget(params.target)
    if (!target) return fail('Connect a repository to a board or a project.', 'bad_request')
    const row = await loadOwned(tools, userId, target, params.id)
    if (isResult(row)) return row
    const parsed = parseRepoInput(params.repo)
    if ('error' in parsed) return fail(parsed.error, 'bad_request')

    const now = Date.now()
    const limited = await takeLookup(tools, userId, now)
    if (limited) return limited
    const fullName = `${parsed.owner}/${parsed.name}`
    const res = await tools.integration<unknown>('github/get-repository', { owner: parsed.owner, repo: parsed.name })
    if (!res.success) {
      console.warn(`[github] get-repository ${JSON.stringify(fullName)} failed: ${res.code ?? ''} ${res.error}`)
      const f = lookupFailure(res as { code?: string; error?: string; status?: number }, fullName)
      return fail(f.error, f.code)
    }
    const repo: RepoInfo | null = repoFromApi(res.data, now)
    if (!repo) return fail(lookupFailure({ status: 404 }, fullName).error, 'not_found')

    await store(tools, target, row, serializeRepo(repo))
    return { success: true, data: { target, id: row.recordId, repo } }
  })

const repoDisconnect: ActionHandler<Env> = ({ userId, params, tools }) =>
  run(async () => {
    const target = parseTarget(params.target)
    if (!target) return fail('Disconnect a repository from a board or a project.', 'bad_request')
    const row = await loadOwned(tools, userId, target, params.id)
    if (isResult(row)) return row
    await store(tools, target, row, '')
    return { success: true, data: { target, id: row.recordId } }
  })

export const githubActions: Record<string, ActionHandler<Env>> = {
  repoConnect,
  repoDisconnect,
}
