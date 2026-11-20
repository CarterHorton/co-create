/**
 * Linking a public GitHub repository to a board or a project. Pure helpers,
 * shared by the server actions (src/actions/github.ts), the UI and the spec
 * export, so they can be unit tested.
 *
 * What is stored (as JSON text, written only by the actions):
 *   projects.repo       — the project's own repo
 *   boards.repo         — the board's own repo (overrides the project's)
 *   boards.projectRepo  — a copy of its project's repo, kept in step by the
 *                         actions when the project's repo changes or the board
 *                         moves in or out of a project. It lives on the board
 *                         so everyone who can open the board can read it
 *                         (projects are readable only by their owner).
 *
 * A board uses its own repo if it has one, else its project's.
 */

/** A connected repo: public metadata captured when it was connected. */
export interface RepoInfo {
  /** "owner/name", as GitHub spells it. */
  fullName: string
  description: string
  defaultBranch: string
  /** https://github.com/owner/name */
  url: string
  /** Epoch ms when it was connected or last refreshed. */
  connectedAt: number
}

export type RepoSource = 'board' | 'project'

/** Longest description we keep, in characters. */
export const MAX_REPO_DESCRIPTION = 300

// GitHub: owners are alphanumerics and single hyphens (max 39); repo names are
// alphanumerics, '-', '_' and '.' (max 100), and never '.' or '..'.
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/
const NAME = /^[A-Za-z0-9._-]{1,100}$/

/**
 * Read "owner/name" or a github.com URL (https://github.com/owner/name,
 * with or without .git, a trailing path or query) into its parts.
 */
export function parseRepoInput(raw: unknown): { owner: string; name: string } | { error: string } {
  const bad = { error: 'Enter a repository as owner/name or a github.com link.' }
  if (typeof raw !== 'string') return bad
  let s = raw.trim()
  if (!s || s.length > 300) return bad
  s = s.replace(/^git@github\.com:/i, '')
  const url = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/(.*)$/i)
  if (url) s = url[1]
  else if (/^[a-z]+:\/\//i.test(s) || /^[^/]*\.[a-z]{2,}\//i.test(s)) {
    return { error: 'Only github.com repositories can be connected.' }
  }
  const [owner = '', rawName = ''] = s.split(/[?#]/)[0].split('/').filter(Boolean)
  const name = rawName.replace(/\.git$/i, '')
  if (!OWNER.test(owner) || !NAME.test(name) || name === '.' || name === '..') return bad
  return { owner, name }
}

/** The repo fields we keep from a `github/get-repository` answer, or null if it isn't a public repo. */
export function repoFromApi(data: unknown, now: number): RepoInfo | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  if (d.private === true) return null
  const fullName = typeof d.full_name === 'string' ? d.full_name : ''
  if (!fullName.includes('/')) return null
  const description = typeof d.description === 'string' ? d.description.replace(/\s+/g, ' ').trim() : ''
  return {
    fullName,
    description: description.length > MAX_REPO_DESCRIPTION ? `${description.slice(0, MAX_REPO_DESCRIPTION - 1)}…` : description,
    defaultBranch: typeof d.default_branch === 'string' && d.default_branch ? d.default_branch : 'main',
    // Built, not copied, so a link we render can only ever point at github.com.
    url: `https://github.com/${fullName}`,
    connectedAt: now,
  }
}

export const serializeRepo = (repo: RepoInfo | null): string => (repo ? JSON.stringify(repo) : '')

/** Parse a stored repo column; anything malformed reads as "no repo". */
export function parseStoredRepo(raw: unknown): RepoInfo | null {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const v = JSON.parse(raw) as Partial<RepoInfo>
    if (typeof v?.fullName !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(v.fullName)) return null
    return {
      fullName: v.fullName,
      description: typeof v.description === 'string' ? v.description : '',
      defaultBranch: typeof v.defaultBranch === 'string' && v.defaultBranch ? v.defaultBranch : 'main',
      url: `https://github.com/${v.fullName}`,
      connectedAt: typeof v.connectedAt === 'number' ? v.connectedAt : 0,
    }
  } catch {
    return null
  }
}

/** The repo a board uses: its own, else the one it inherits from its project. */
export function effectiveRepo(board: { repo?: unknown; projectRepo?: unknown; projectId?: unknown }): {
  repo: RepoInfo
  source: RepoSource
} | null {
  const own = parseStoredRepo(board.repo)
  if (own) return { repo: own, source: 'board' }
  // An inherited copy only counts while the board is in a project.
  const inherited = board.projectId ? parseStoredRepo(board.projectRepo) : null
  return inherited ? { repo: inherited, source: 'project' } : null
}

/** The line the Markdown spec carries near its top. */
export function specRepoLine(repo: RepoInfo): string {
  const desc = repo.description ? ` — ${repo.description}` : ''
  return `**Repository:** [${repo.fullName}](${repo.url}) (default branch \`${repo.defaultBranch.replace(/`/g, '')}\`)${desc}`
}

/** Lookups one person may trigger: per hour, and per day. The app owner pays for each. */
export const REPO_LOOKUPS_PER_HOUR = 10
export const REPO_LOOKUPS_PER_DAY = 30
const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Whether another lookup is allowed given the times of this person's earlier ones. */
export function lookupAllowed(times: number[], now: number): { ok: true } | { ok: false; error: string } {
  const lastHour = times.filter((t) => t > now - HOUR).length
  const lastDay = times.filter((t) => t > now - DAY).length
  if (lastHour >= REPO_LOOKUPS_PER_HOUR || lastDay >= REPO_LOOKUPS_PER_DAY) {
    return {
      ok: false,
      error: `You can look up at most ${REPO_LOOKUPS_PER_HOUR} repositories an hour (${REPO_LOOKUPS_PER_DAY} a day). Try again later.`,
    }
  }
  return { ok: true }
}

/** Lookup rows older than this can be pruned. */
export const LOOKUP_RETENTION_MS = DAY

/** A clear message (and code) for a failed `github/get-repository` call. */
export function lookupFailure(
  res: { code?: string; error?: string; status?: number },
  fullName: string,
): { error: string; code: string } {
  const text = `${res.code ?? ''} ${res.error ?? ''}`
  if (res.code === 'insufficient_credits' || res.status === 402 || /insufficient[_ ]credits/i.test(text)) {
    return {
      error: 'GitHub lookups are paused because the app is out of credits. Try again later.',
      code: 'insufficient_credits',
    }
  }
  if (/\b404\b|not found/i.test(text)) {
    return {
      error: `Couldn't find a public GitHub repository called ${fullName}. Check the name, and note that private repositories can't be connected.`,
      code: 'not_found',
    }
  }
  if (/\b403\b|\b429\b|rate limit/i.test(text)) {
    return { error: 'GitHub is busy right now. Try again in a few minutes.', code: 'upstream_busy' }
  }
  return { error: "Couldn't reach GitHub. Try again in a moment.", code: 'upstream_error' }
}
