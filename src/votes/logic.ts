/**
 * Vote panels — the pure parts, shared by the server actions
 * (src/actions/votes.ts) and the board UI, and unit-tested without either.
 *
 * A vote panel is opened on two or more selected sticky notes. Everyone on
 * the board can vote on those notes (and only those) until the person who
 * opened it closes it, which finalizes the results. If they leave the board
 * it closes too: while it's open their client sends a heartbeat, and anyone
 * may close a panel whose heartbeat has gone stale.
 *
 *   parse…Params   — validate action input
 *   decideAdd      — may this vote be added? (per-person limit)
 *   tallyVotes     — per-note count + "you voted", for one panel
 *   rankResults    — a panel's notes by votes, most first
 *   describe…      — the words the UI shows and announces
 */

export const MIN_PANEL_NOTES = 2
export const MAX_PANEL_NOTES = 50
export const DEFAULT_PER_PERSON = 1
/** The opener's client refreshes `heartbeatAt` this often while the panel is open. */
export const HEARTBEAT_MS = 10_000
/** A heartbeat older than this means the opener is gone: anyone may close the panel. */
export const STALE_MS = 30_000
const MAX_ID_LENGTH = 200

export interface VoteRow {
  boardId: string
  panelId: string
  shapeId: string
  userId: string
}

export type PanelStatus = 'open' | 'closed'
/** Why a panel closed: its opener closed it, or they left the board. */
export type CloseReason = 'closed' | 'opener-left'

export type PanelRow = {
  boardId: string
  openedBy: string
  openedByName?: string
  /** JSON array of sticky note ids. */
  shapeIds: string | string[]
  perPerson: number
  status: PanelStatus
  openedAt: number
  heartbeatAt: number
  closedAt?: number
  closeReason?: CloseReason
  /** JSON object shapeId → final vote count, written when the panel closes. */
  results?: string | Record<string, number>
}

type Invalid = { error: string }

const validId = (raw: unknown): raw is string =>
  typeof raw === 'string' && raw.trim().length > 0 && raw.length <= MAX_ID_LENGTH

/** A stored JSON column comes back as a string or already parsed. */
function fromJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string') return (raw as T) ?? fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const panelShapeIds = (row: Pick<PanelRow, 'shapeIds'>): string[] => {
  const ids = fromJson<unknown>(row.shapeIds, [])
  return Array.isArray(ids) ? ids.filter(validId) : []
}

export const panelResults = (row: Pick<PanelRow, 'results'>): Record<string, number> => {
  const r = fromJson<unknown>(row.results, {})
  return r && typeof r === 'object' && !Array.isArray(r) ? (r as Record<string, number>) : {}
}

export interface OpenInput {
  boardId: string
  shapeIds: string[]
  perPerson: number
}

/** Validate `votePanelOpen` params. */
export function parseOpenParams(params: Record<string, unknown>): OpenInput | Invalid {
  if (!validId(params.boardId)) return { error: 'Missing board.' }
  const raw = params.shapeIds
  if (!Array.isArray(raw) || !raw.every(validId)) return { error: 'Select the sticky notes to vote on.' }
  const shapeIds = [...new Set(raw as string[])]
  if (shapeIds.length < MIN_PANEL_NOTES) return { error: `Select at least ${MIN_PANEL_NOTES} sticky notes to vote on.` }
  if (shapeIds.length > MAX_PANEL_NOTES) return { error: `A vote can have at most ${MAX_PANEL_NOTES} notes.` }
  const perPerson = params.perPerson ?? DEFAULT_PER_PERSON
  if (typeof perPerson !== 'number' || !Number.isInteger(perPerson) || perPerson < 1 || perPerson > shapeIds.length) {
    return { error: `Votes per person must be a whole number from 1 to ${shapeIds.length}.` }
  }
  return { boardId: params.boardId, shapeIds, perPerson }
}

export interface ToggleInput {
  panelId: string
  shapeId: string
}

/** Validate `voteToggle` params. */
export function parseToggleParams(params: Record<string, unknown>): ToggleInput | Invalid {
  if (!validId(params.panelId)) return { error: 'Missing vote.' }
  if (!validId(params.shapeId)) return { error: 'Missing note.' }
  return { panelId: params.panelId, shapeId: params.shapeId }
}

/**
 * Validate `votePanelClose` / `votePanelHeartbeat` params. `leaving`: the
 * opener's page is closing, so it closes because they left.
 */
export function parsePanelParams(params: Record<string, unknown>): { panelId: string; leaving: boolean } | Invalid {
  if (!validId(params.panelId)) return { error: 'Missing vote.' }
  return { panelId: params.panelId, leaving: params.leaving === true }
}

/** The opener's heartbeat has stopped: they've left the board. */
export const isStale = (heartbeatAt: number, now: number) => !(now - heartbeatAt < STALE_MS)

export type CloseDecision = { ok: true; reason: CloseReason } | { ok: false; error: string; code: 'forbidden' | 'conflict' }

/** Who may close an open panel: its opener any time; anyone on the board once the opener is gone. */
export function decideClose(
  panel: Pick<PanelRow, 'openedBy' | 'status' | 'heartbeatAt'>,
  userId: string,
  now: number,
  leaving = false,
): CloseDecision {
  if (panel.status !== 'open') return { ok: false, code: 'conflict', error: 'This vote is already closed.' }
  if (panel.openedBy === userId) return { ok: true, reason: leaving ? 'opener-left' : 'closed' }
  if (isStale(panel.heartbeatAt, now)) return { ok: true, reason: 'opener-left' }
  return { ok: false, code: 'forbidden', error: 'Only the person who opened this vote can close it.' }
}

export type ToggleDecision = { ok: true } | { ok: false; error: string; code: 'limit' }

/** Can someone who already holds `used` votes in a panel add one more? (Removing is always allowed.) */
export function decideAdd(used: number, perPerson: number): ToggleDecision {
  if (used >= perPerson) {
    return {
      ok: false,
      code: 'limit',
      error:
        perPerson === 1
          ? 'You already voted. Remove your vote to pick another note.'
          : `You've used all ${perPerson} of your votes. Remove one to vote for another note.`,
    }
  }
  return { ok: true }
}

export interface NoteVotes {
  count: number
  mine: boolean
}

/**
 * Votes per note in one panel. Only the panel's notes count, and a duplicate
 * row (same person, same note) counts once.
 */
export function tallyVotes(
  votes: readonly Pick<VoteRow, 'panelId' | 'shapeId' | 'userId'>[],
  panelId: string,
  shapeIds: readonly string[],
  userId: string | undefined,
): Map<string, NoteVotes> {
  const allowed = new Set(shapeIds)
  const voters = new Map<string, Set<string>>(shapeIds.map((id) => [id, new Set<string>()]))
  for (const v of votes) {
    if (v.panelId !== panelId || !allowed.has(v.shapeId)) continue
    voters.get(v.shapeId)!.add(v.userId)
  }
  return new Map([...voters].map(([id, set]) => [id, { count: set.size, mine: !!userId && set.has(userId) }]))
}

/** How many votes `userId` holds in a panel. */
export function votesUsed(tally: ReadonlyMap<string, NoteVotes>): number {
  let n = 0
  for (const v of tally.values()) if (v.mine) n++
  return n
}

export interface RankedNote {
  shapeId: string
  count: number
  /** Ties for the most votes (and at least one vote). */
  top: boolean
}

/** A panel's notes by votes, most first; ties keep the panel's order. */
export function rankResults(shapeIds: readonly string[], counts: Readonly<Record<string, number>>): RankedNote[] {
  const rows = shapeIds.map((shapeId, i) => ({ shapeId, i, count: counts[shapeId] ?? 0 }))
  rows.sort((a, b) => b.count - a.count || a.i - b.i)
  const max = rows[0]?.count ?? 0
  return rows.map(({ shapeId, count }) => ({ shapeId, count, top: max > 0 && count === max }))
}

/**
 * Vote counts for the Markdown export: each note's count from the most
 * recent closed panel it was in.
 */
export function latestResults(panels: readonly Pick<PanelRow, 'status' | 'closedAt' | 'shapeIds' | 'results'>[]): Map<string, number> {
  const out = new Map<string, number>()
  const closed = panels.filter((p) => p.status === 'closed').sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
  for (const p of closed) {
    const results = panelResults(p)
    for (const id of panelShapeIds(p)) if (!out.has(id)) out.set(id, results[id] ?? 0)
  }
  for (const [id, n] of out) if (n === 0) out.delete(id)
  return out
}

export const plural = (n: number, one = 'vote', many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "2 of 3 votes left". */
export function describeLeft(used: number, limit: number): string {
  const left = Math.max(0, limit - used)
  return `${left} of ${plural(limit)} left`
}

/** Announced after your own vote: "Voted, 4 votes" / "Vote removed, 3 votes" (+ what's left). */
export function describeResult(r: { voted: boolean; count: number; used: number; limit: number }): string {
  return `${r.voted ? 'Voted' : 'Vote removed'}, ${plural(r.count)}. ${describeLeft(r.used, r.limit)}`
}

/** Toast when someone opens a panel: "Alex opened a vote on 3 notes". */
export const describeOpened = (name: string, notes: number, perPerson: number) =>
  `${name} opened a vote on ${plural(notes, 'note')}${perPerson > 1 ? ` (${plural(perPerson)} each)` : ''}`

/** Toast when a panel closes. */
export function describeClosed(name: string, reason: CloseReason | undefined, winner: string | null): string {
  const head = reason === 'opener-left' ? `${name} left, so their vote closed` : `${name} closed the vote`
  return winner ? `${head}. Top: ${winner}` : `${head}. No votes were cast.`
}

/** Appended to a note's accessible name while it's in an open vote: ", in a vote, 3 votes, including yours". */
export function voteLabelSuffix(v: NoteVotes | undefined): string {
  if (!v) return ''
  return `, in a vote, ${plural(v.count)}${v.mine ? ', including yours' : ''}`
}
