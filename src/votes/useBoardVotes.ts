/**
 * Live votes for one signed-in board: counts per sticky note, the caller's
 * own votes, the optional dot-voting round, and the actions that change them
 * (all server-side, see src/actions/votes.ts). Also owns the screen-reader
 * announcements for voting: your own vote result and a round starting or
 * ending (for everyone on the board).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'deepspace'
import { callAction } from '@/lib/actions'
import { useAnnouncer } from '@/components/board/LiveRegion'
import type { BoardShape } from '@/components/board/types'
import {
  aggregateVotes,
  describeResult,
  plural,
  staleVoteIds,
  voteLabelSuffix,
  votesUsed,
  type NoteVotes,
  type VoteRow,
} from './logic'

interface RoundRow {
  boardId: string
  perPerson: number
  active?: boolean | number
}

/** What the whiteboard and the Votes pane need. */
export interface BoardVoting {
  /** Votes per live sticky note (only notes with votes). */
  counts: ReadonlyMap<string, NoteVotes>
  /** Vote counts for the Markdown export. */
  specCounts: ReadonlyMap<string, number>
  /** The active dot-voting round, or null when votes are unlimited. */
  round: { limit: number } | null
  /** The caller's votes on live notes. */
  used: number
  isOwner: boolean
  /** A vote request is in flight. */
  busy: boolean
  /** Add or remove the caller's vote on a sticky note. */
  toggle: (shapeId: string) => Promise<void>
  startRound: (limit: number, clear: boolean) => Promise<void>
  endRound: () => Promise<void>
  clearVotes: () => Promise<void>
  /** ", 3 votes, including yours" for a note's accessible name. */
  labelSuffix: (shapeId: string) => string
  /** Ask the whiteboard to select, pan to and focus a note. */
  reveal: (shapeId: string) => void
  /** The whiteboard listens for reveal requests; returns an unsubscribe. */
  onReveal: (fn: (shapeId: string) => void) => () => void
  /** Live-region text (rendered by the board page). */
  announcement: string
  /** Last error (shown in the Votes pane). */
  error: string | null
}

const NO_COUNTS: ReadonlyMap<string, NoteVotes> = new Map()

export function useBoardVotes({
  boardId,
  userId,
  isOwner,
  shapes,
}: {
  boardId: string
  userId: string | undefined
  isOwner: boolean
  /** The live board's shapes (not a history preview). */
  shapes: BoardShape[]
}): BoardVoting {
  const { records: voteRecords } = useQuery<VoteRow>('votes', { where: { boardId }, limit: 10_000 })
  const { records: roundRecords, status: roundStatus } = useQuery<RoundRow>('vote_rounds', { where: { boardId }, limit: 1 })
  const { message: announcement, say } = useAnnouncer()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const liveIds = useMemo(() => new Set(shapes.filter((s) => s.type === 'sticky').map((s) => s.id)), [shapes])
  const votes = useMemo(() => voteRecords.map((r) => r.data), [voteRecords])
  const counts = useMemo(
    () => (votes.length ? aggregateVotes(votes, liveIds, userId) : NO_COUNTS),
    [votes, liveIds, userId],
  )
  const specCounts = useMemo(() => new Map([...counts].map(([id, v]) => [id, v.count])), [counts])
  const used = useMemo(() => votesUsed(votes, liveIds, userId), [votes, liveIds, userId])

  const row = roundRecords[0]?.data
  const limit = row && row.active ? row.perPerson : null
  const round = useMemo(() => (limit ? { limit } : null), [limit])

  // Announce a round starting or ending — but not the state the board loaded in.
  const lastLimit = useRef<number | null | undefined>(undefined)
  useEffect(() => {
    if (roundStatus === 'loading') return
    const prev = lastLimit.current
    lastLimit.current = limit
    if (prev === undefined || prev === limit) return
    if (limit) say(`Voting round started: ${plural(limit)} per person`, 'round')
    else say('Voting round ended', 'round')
  }, [limit, roundStatus, say])

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Try again.'
      setError(msg)
      say(msg, 'vote-error')
      return undefined
    } finally {
      setBusy(false)
    }
  }, [say])

  const votesRef = useRef(votes)
  const liveRef = useRef(liveIds)
  useEffect(() => {
    votesRef.current = votes
    liveRef.current = liveIds
  }, [votes, liveIds])

  const toggle = useCallback(
    async (shapeId: string) => {
      if (!liveRef.current.has(shapeId)) return
      const staleShapeIds = staleVoteIds(votesRef.current, liveRef.current, userId)
      const res = await run(() =>
        callAction<{ voted: boolean; count: number; used: number; limit: number | null }>('voteToggle', {
          boardId,
          shapeId,
          staleShapeIds,
        }),
      )
      if (res) say(describeResult(res), 'vote')
    },
    [boardId, userId, run, say],
  )

  const startRound = useCallback(
    async (n: number, clear: boolean) => {
      await run(() => callAction('voteRoundStart', { boardId, limit: n, clear }))
    },
    [boardId, run],
  )
  const endRound = useCallback(async () => {
    await run(() => callAction('voteRoundEnd', { boardId }))
  }, [boardId, run])
  const clearVotes = useCallback(async () => {
    const res = await run(() => callAction('voteClear', { boardId }))
    if (res) say('All votes cleared', 'vote-clear')
  }, [boardId, run, say])

  const labelSuffix = useCallback((shapeId: string) => voteLabelSuffix(counts.get(shapeId)), [counts])

  const [listeners] = useState(() => new Set<(id: string) => void>())
  const reveal = useCallback((id: string) => listeners.forEach((fn) => fn(id)), [listeners])
  const onReveal = useCallback(
    (fn: (id: string) => void) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    [listeners],
  )

  return useMemo(
    () => ({
      counts,
      specCounts,
      round,
      used,
      isOwner,
      busy,
      toggle,
      startRound,
      endRound,
      clearVotes,
      labelSuffix,
      reveal,
      onReveal,
      announcement,
      error,
    }),
    [counts, specCounts, round, used, isOwner, busy, toggle, startRound, endRound, clearVotes, labelSuffix, reveal, onReveal, announcement, error],
  )
}
