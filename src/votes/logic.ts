/**
 * Voting on sticky notes — the pure parts, shared by the server actions
 * (src/actions/votes.ts) and the board UI, and unit-tested without either.
 *
 *   parseToggleParams / parseRoundParams — validate action input
 *   decideToggle      — may this vote be added? (dot-voting limit, hard cap)
 *   aggregateVotes    — per-note count + "you voted", ignoring deleted notes
 *   topVoted          — notes by count, for the "Top voted" list
 *   describe…         — the words the UI shows and announces
 */

/** Without a round votes are unlimited per note, but one person can't hold more than this on a board. */
export const MAX_VOTES_PER_USER = 500
export const DEFAULT_ROUND_LIMIT = 3
export const MAX_ROUND_LIMIT = 50
/** Ids of the caller's votes on deleted notes, dropped before the limit is checked. */
export const MAX_STALE_IDS = 200
const MAX_ID_LENGTH = 200

export interface VoteRow {
  boardId: string
  shapeId: string
  userId: string
}

export interface VoteRound {
  /** Votes per person while the round is active. */
  limit: number
  active: boolean
}

type Invalid = { error: string }

const validId = (raw: unknown): raw is string =>
  typeof raw === 'string' && raw.trim().length > 0 && raw.length <= MAX_ID_LENGTH

export interface ToggleInput {
  boardId: string
  shapeId: string
  /** Shape ids (no longer on the board) whose votes by the caller can be dropped. */
  staleShapeIds: string[]
}

/** Validate `voteToggle` params. */
export function parseToggleParams(params: Record<string, unknown>): ToggleInput | Invalid {
  if (!validId(params.boardId)) return { error: 'Missing board.' }
  if (!validId(params.shapeId)) return { error: 'Missing note.' }
  const stale = params.staleShapeIds ?? []
  if (!Array.isArray(stale) || stale.length > MAX_STALE_IDS || !stale.every(validId)) {
    return { error: 'Invalid note list.' }
  }
  const staleShapeIds = [...new Set(stale as string[])].filter((id) => id !== params.shapeId)
  return { boardId: params.boardId, shapeId: params.shapeId, staleShapeIds }
}

export interface RoundInput {
  boardId: string
  limit: number
  /** Start with no votes on the board. */
  clear: boolean
}

/** Validate `voteRoundStart` params. */
export function parseRoundParams(params: Record<string, unknown>): RoundInput | Invalid {
  if (!validId(params.boardId)) return { error: 'Missing board.' }
  const limit = params.limit ?? DEFAULT_ROUND_LIMIT
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_ROUND_LIMIT) {
    return { error: `Votes per person must be a whole number from 1 to ${MAX_ROUND_LIMIT}.` }
  }
  if (params.clear !== undefined && typeof params.clear !== 'boolean') return { error: 'Invalid clear flag.' }
  return { boardId: params.boardId, limit, clear: params.clear === true }
}

export type ToggleDecision = { ok: true } | { ok: false; error: string; code: 'limit' | 'cap' }

/**
 * Can someone who already holds `used` votes on the board add one more?
 * Removing a vote is always allowed, so this is only asked when adding.
 */
export function decideAdd(used: number, round: VoteRound | null): ToggleDecision {
  if (round?.active && used >= round.limit) {
    return {
      ok: false,
      code: 'limit',
      error: `You've used all ${round.limit} of your votes. Remove one to vote for another note.`,
    }
  }
  if (used >= MAX_VOTES_PER_USER) return { ok: false, code: 'cap', error: 'You have too many votes on this board.' }
  return { ok: true }
}

export interface NoteVotes {
  count: number
  mine: boolean
}

/**
 * Votes per note. Votes on notes that are no longer on the board (deleted)
 * are ignored, and a duplicate row (same person, same note) counts once.
 */
export function aggregateVotes(
  votes: readonly Pick<VoteRow, 'shapeId' | 'userId'>[],
  liveIds: ReadonlySet<string>,
  userId: string | undefined,
): Map<string, NoteVotes> {
  const voters = new Map<string, Set<string>>()
  for (const v of votes) {
    if (!liveIds.has(v.shapeId)) continue
    let set = voters.get(v.shapeId)
    if (!set) voters.set(v.shapeId, (set = new Set()))
    set.add(v.userId)
  }
  const out = new Map<string, NoteVotes>()
  for (const [id, set] of voters) out.set(id, { count: set.size, mine: !!userId && set.has(userId) })
  return out
}

/** How many of `userId`'s votes are on live notes (what the limit counts). */
export function votesUsed(
  votes: readonly Pick<VoteRow, 'shapeId' | 'userId'>[],
  liveIds: ReadonlySet<string>,
  userId: string | undefined,
): number {
  if (!userId) return 0
  return new Set(votes.filter((v) => v.userId === userId && liveIds.has(v.shapeId)).map((v) => v.shapeId)).size
}

/** `userId`'s votes on notes no longer on the board: safe to drop. */
export function staleVoteIds(
  votes: readonly Pick<VoteRow, 'shapeId' | 'userId'>[],
  liveIds: ReadonlySet<string>,
  userId: string | undefined,
): string[] {
  if (!userId) return []
  const ids = votes.filter((v) => v.userId === userId && !liveIds.has(v.shapeId)).map((v) => v.shapeId)
  return [...new Set(ids)].slice(0, MAX_STALE_IDS)
}

/**
 * Notes with at least one vote, most first; ties keep the given order
 * (pass notes in reading order so ties read top to bottom).
 */
export function topVoted<T extends { id: string }>(notes: readonly T[], counts: ReadonlyMap<string, NoteVotes>, max = 20) {
  return notes
    .map((note, i) => ({ note, i, votes: counts.get(note.id) }))
    .filter((x): x is { note: T; i: number; votes: NoteVotes } => !!x.votes && x.votes.count > 0)
    .sort((a, b) => b.votes.count - a.votes.count || a.i - b.i)
    .slice(0, max)
    .map(({ note, votes }) => ({ note, ...votes }))
}

export const plural = (n: number, one = 'vote', many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "2 of 3 votes left". */
export function describeLeft(used: number, limit: number): string {
  const left = Math.max(0, limit - used)
  return `${left} of ${plural(limit)} left`
}

/** Announced after your own vote: "Voted, 4 votes" / "Vote removed, 3 votes" (+ what's left in a round). */
export function describeResult(r: { voted: boolean; count: number; used?: number; limit?: number | null }): string {
  const head = `${r.voted ? 'Voted' : 'Vote removed'}, ${plural(r.count)}`
  return r.limit && r.used !== undefined ? `${head}. ${describeLeft(r.used, r.limit)}` : head
}

/** Appended to a note's accessible name: ", 3 votes, including yours". */
export function voteLabelSuffix(v: NoteVotes | undefined): string {
  if (!v || v.count === 0) return ''
  return `, ${plural(v.count)}${v.mine ? ', including yours' : ''}`
}
