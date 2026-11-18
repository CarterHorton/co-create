/**
 * Comments, threads and @mentions — the pure parts, shared by the server
 * actions (src/actions/comments.ts) and the UI (src/comments/*), and
 * unit-tested in model.test.ts.
 *
 *   parseCommentParams / parseEditParams / parseIdParam — validate action params
 *   findMentions   — which board members a body @mentions
 *   splitMentions  — the same, as text segments to render
 *   mentionQuery   — the "@partial" being typed at the caret, for suggestions
 *   groupThreads   — flat comment rows → threads (root + replies)
 */

export const MAX_BODY_LENGTH = 4000
/** Ids are SDK record ids or canvas shape ids: short. */
export const MAX_ID_LENGTH = 200
/** At most this many people are notified by one comment. */
export const MAX_MENTIONS = 20

type Invalid = { error: string }

export interface CommentInput {
  boardId: string
  shapeId: string | null
  parentId: string | null
  body: string
}

export interface EditInput {
  commentId: string
  body: string
}

function checkId(raw: unknown, what: string): string | Invalid {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > MAX_ID_LENGTH) return { error: `Missing ${what}.` }
  return raw
}

function optionalId(raw: unknown, what: string): string | null | Invalid {
  if (raw === undefined || raw === null || raw === '') return null
  return checkId(raw, what)
}

export function checkBody(raw: unknown): string | Invalid {
  if (typeof raw !== 'string') return { error: 'A comment needs some text.' }
  const body = raw.trim()
  if (!body) return { error: 'A comment needs some text.' }
  if (body.length > MAX_BODY_LENGTH) return { error: `Comments are at most ${MAX_BODY_LENGTH} characters.` }
  return body
}

/** Validate `commentCreate` params. */
export function parseCommentParams(params: Record<string, unknown>): CommentInput | Invalid {
  const boardId = checkId(params.boardId, 'board')
  if (typeof boardId !== 'string') return boardId
  const shapeId = optionalId(params.shapeId, 'shape')
  if (shapeId !== null && typeof shapeId !== 'string') return shapeId
  const parentId = optionalId(params.parentId, 'thread')
  if (parentId !== null && typeof parentId !== 'string') return parentId
  const body = checkBody(params.body)
  if (typeof body !== 'string') return body
  return { boardId, shapeId, parentId, body }
}

/** Validate `commentEdit` params. */
export function parseEditParams(params: Record<string, unknown>): EditInput | Invalid {
  const commentId = checkId(params.commentId, 'comment')
  if (typeof commentId !== 'string') return commentId
  const body = checkBody(params.body)
  if (typeof body !== 'string') return body
  return { commentId, body }
}

export function parseIdParam(params: Record<string, unknown>, key: string, what: string): string | Invalid {
  return checkId(params[key], what)
}

// ── Mentions ──────────────────────────────────────────────────────────────

export interface Member {
  userId: string
  name: string
}

const WORD = /[\p{L}\p{N}_]/u

/** Members to match against, longest name first so "@Ann Lee" beats "@Ann". */
function candidates(members: Member[]): Member[] {
  return members.filter((m) => m.name.trim()).sort((a, b) => b.name.length - a.name.length)
}

/** The member whose name starts at `i` (just after an "@"), if any. */
function matchAt(body: string, i: number, sorted: Member[]): Member | null {
  const lower = body.toLowerCase()
  for (const m of sorted) {
    const name = m.name.trim().toLowerCase()
    if (!lower.startsWith(name, i)) continue
    const next = body[i + name.length]
    if (next === undefined || !WORD.test(next)) return m
  }
  return null
}

/** An "@" starts a mention only at the start or after a non-word character (not in "a@b.com"). */
function isMentionStart(body: string, i: number): boolean {
  return body[i] === '@' && (i === 0 || !WORD.test(body[i - 1]))
}

export type Segment = { text: string; userId?: string }

/** Body split into plain text and "@Name" segments (with the member's id). */
export function splitMentions(body: string, members: Member[]): Segment[] {
  const sorted = candidates(members)
  const out: Segment[] = []
  let plain = ''
  let i = 0
  while (i < body.length) {
    const m = isMentionStart(body, i) ? matchAt(body, i + 1, sorted) : null
    if (m) {
      if (plain) out.push({ text: plain })
      plain = ''
      const len = m.name.trim().length + 1
      out.push({ text: body.slice(i, i + len), userId: m.userId })
      i += len
    } else {
      plain += body[i]
      i++
    }
  }
  if (plain) out.push({ text: plain })
  return out
}

/** Distinct ids of the members `body` @mentions, in order, capped at MAX_MENTIONS. */
export function findMentions(body: string, members: Member[]): string[] {
  const ids: string[] = []
  for (const s of splitMentions(body, members)) {
    if (s.userId && !ids.includes(s.userId)) ids.push(s.userId)
  }
  return ids.slice(0, MAX_MENTIONS)
}

/**
 * The mention being typed at `caret`: "@Al|" → { start: index of "@", query: "Al" }.
 * Null when the caret isn't in one. A query may contain single spaces (names do),
 * but not a line break, and is at most 40 characters.
 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0 || !isMentionStart(text, at)) return null
  const query = before.slice(at + 1)
  if (query.length > 40 || /\n|\s\s|^\s/.test(query)) return null
  return { start: at, query }
}

/** Members whose name contains `query` (prefix matches first), minus `exclude`. */
export function suggestMembers(members: Member[], query: string, exclude?: string, limit = 6): Member[] {
  const q = query.trim().toLowerCase()
  const seen = new Set<string>()
  const scored: { m: Member; score: number }[] = []
  for (const m of members) {
    if (m.userId === exclude || seen.has(m.userId) || !m.name.trim()) continue
    seen.add(m.userId)
    const name = m.name.toLowerCase()
    const score = !q ? 1 : name.startsWith(q) ? 0 : name.includes(q) ? 1 : -1
    if (score >= 0) scored.push({ m, score })
  }
  scored.sort((a, b) => a.score - b.score || a.m.name.localeCompare(b.m.name))
  return scored.slice(0, limit).map((s) => s.m)
}

/** Text with "@query" at `start` replaced by "@Name ", and where the caret goes after it. */
export function insertMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const inserted = `@${name} `
  return { text: text.slice(0, start) + inserted + text.slice(caret), caret: start + inserted.length }
}

/** A one-line excerpt for notifications and announcements. */
export function excerpt(body: string, max = 140): string {
  const t = body.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

// ── Threads ───────────────────────────────────────────────────────────────

export interface CommentRow {
  id: string
  boardId: string
  shapeId: string | null
  parentId: string | null
  authorId: string
  authorName: string
  body: string
  mentions: string[]
  resolved: boolean
  createdAt: string
  editedAt: string | null
}

export interface Thread {
  root: CommentRow
  replies: CommentRow[]
}

/** Roots oldest first, each with its replies oldest first. Orphaned replies are dropped. */
export function groupThreads(rows: CommentRow[]): Thread[] {
  const byTime = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const threads = new Map<string, Thread>()
  for (const r of byTime) if (!r.parentId) threads.set(r.id, { root: r, replies: [] })
  for (const r of byTime) if (r.parentId) threads.get(r.parentId)?.replies.push(r)
  return [...threads.values()]
}

/** Comments (roots + replies) in each shape's open threads, for the count badges. */
export function openCounts(threads: Thread[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const t of threads) {
    const s = t.root.shapeId
    if (s && !t.root.resolved) counts.set(s, (counts.get(s) ?? 0) + 1 + t.replies.length)
  }
  return counts
}
