/**
 * Vote panels for one signed-in board (all writes server-side, see
 * src/actions/votes.ts):
 *   - the open panel (if any): its notes, live counts, your votes;
 *   - closed panels' results (the Votes pane, the export);
 *   - toasts for everyone when a panel opens or closes;
 *   - keeping your own panel open (heartbeat) while you're on the board, and
 *     closing someone else's once they've left it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'deepspace'
import { callAction } from '@/lib/actions'
import { useAnnouncer } from '@/components/board/LiveRegion'
import { useToast } from '@/components/ui'
import { shapeText } from '@/components/board/shapes'
import type { BoardShape } from '@/components/board/types'
import {
  HEARTBEAT_MS,
  describeClosed,
  describeOpened,
  describeResult,
  latestResults,
  panelResults,
  panelShapeIds,
  rankResults,
  tallyVotes,
  voteLabelSuffix,
  votesUsed,
  type CloseReason,
  type NoteVotes,
  type PanelRow,
  type RankedNote,
  type VoteRow,
} from './logic'

export interface OpenPanel {
  id: string
  openedBy: string
  openedByName: string
  shapeIds: string[]
  perPerson: number
  /** You opened it (so you close it). */
  mine: boolean
}

export interface ClosedPanel {
  id: string
  openedByName: string
  closedAt: number
  reason: CloseReason | undefined
  perPerson: number
  ranked: RankedNote[]
}

/** What the whiteboard and the Votes pane need. */
export interface BoardVoting {
  /** The open vote, or null. */
  panel: OpenPanel | null
  /** Votes per note in the open panel (every note in it, zero included). */
  counts: ReadonlyMap<string, NoteVotes>
  /** Your votes in the open panel. */
  used: number
  /** Closed votes, newest first. */
  closed: ClosedPanel[]
  /** Vote counts for the Markdown export (each note's latest closed vote). */
  specCounts: ReadonlyMap<string, number>
  /** Signed in and on the board: may open a vote (editors). */
  canOpen: boolean
  /** A request is in flight. */
  busy: boolean
  inPanel: (shapeId: string) => boolean
  /** Add or remove your vote on a note in the open panel. */
  toggle: (shapeId: string) => Promise<void>
  open: (shapeIds: string[], perPerson: number) => Promise<boolean>
  /** Close the open panel (its opener), finalizing the results. */
  close: () => Promise<void>
  /** ", in a vote, 3 votes, including yours" for a note's accessible name. */
  labelSuffix: (shapeId: string) => string
  /** Ask the whiteboard to select, pan to and focus a note. */
  reveal: (shapeId: string) => void
  /** The whiteboard listens for reveal requests; returns an unsubscribe. */
  onReveal: (fn: (shapeId: string) => void) => () => void
  /** Live-region text (rendered by the board page). */
  announcement: string
  error: string | null
}

const NO_COUNTS: ReadonlyMap<string, NoteVotes> = new Map()

export function useBoardVotes({
  boardId,
  userId,
  canEdit,
  shapes,
  peers,
  presenceConnected,
}: {
  boardId: string
  userId: string | undefined
  canEdit: boolean
  /** The live board's shapes (not a history preview). */
  shapes: BoardShape[]
  /** Who's on the board right now. */
  peers: readonly { userId: string }[]
  presenceConnected: boolean
}): BoardVoting {
  const { records: panelRecords, status: panelStatus } = useQuery<PanelRow>('vote_panels', {
    where: { boardId },
    orderBy: 'openedAt',
    orderDir: 'desc',
    limit: 50,
  })
  const { records: voteRecords } = useQuery<VoteRow>('votes', { where: { boardId }, limit: 10_000 })
  const { message: announcement, say } = useAnnouncer()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openRow = panelRecords.find((r) => r.data.status === 'open')
  const panel = useMemo<OpenPanel | null>(
    () =>
      openRow
        ? {
            id: openRow.recordId,
            openedBy: openRow.data.openedBy,
            openedByName: openRow.data.openedByName || 'Someone',
            shapeIds: panelShapeIds(openRow.data),
            perPerson: openRow.data.perPerson,
            mine: !!userId && openRow.data.openedBy === userId,
          }
        : null,
    [openRow?.recordId, openRow?.data.openedBy, openRow?.data.openedByName, openRow?.data.shapeIds, openRow?.data.perPerson, userId],
  )

  const votes = useMemo(() => voteRecords.map((r) => r.data), [voteRecords])
  const counts = useMemo(
    () => (panel ? tallyVotes(votes, panel.id, panel.shapeIds, userId) : NO_COUNTS),
    [votes, panel, userId],
  )
  const used = useMemo(() => votesUsed(counts), [counts])

  const closed = useMemo<ClosedPanel[]>(
    () =>
      panelRecords
        .filter((r) => r.data.status === 'closed')
        .map((r) => ({
          id: r.recordId,
          openedByName: r.data.openedByName || 'Someone',
          closedAt: r.data.closedAt ?? 0,
          reason: r.data.closeReason,
          perPerson: r.data.perPerson,
          ranked: rankResults(panelShapeIds(r.data), panelResults(r.data)),
        }))
        .sort((a, b) => b.closedAt - a.closedAt),
    [panelRecords],
  )
  const specCounts = useMemo(() => latestResults(panelRecords.map((r) => r.data)), [panelRecords])

  // ── Toasts: a panel opening or closing (not the state the board loaded in) ──
  const textOf = useRef((id: string) => id)
  useEffect(() => {
    const byId = new Map(shapes.map((s) => [s.id, s]))
    textOf.current = (id) => {
      const s = byId.get(id)
      const t = s ? shapeText(s).split('\n')[0].trim() : ''
      return t ? `“${t.length > 40 ? `${t.slice(0, 40)}…` : t}”` : 'a deleted note'
    }
  }, [shapes])
  const seen = useRef<{ openId: string | null } | null>(null)
  useEffect(() => {
    if (panelStatus === 'loading') return
    const prev = seen.current
    seen.current = { openId: panel?.id ?? null }
    if (!prev) return
    if (panel && panel.id !== prev.openId) {
      toast.info(panel.mine ? 'You opened a vote' : describeOpened(panel.openedByName, panel.shapeIds.length, panel.perPerson))
    }
    if (prev.openId && prev.openId !== panel?.id) {
      const c = closed.find((p) => p.id === prev.openId)
      if (c) {
        const top = c.ranked.filter((r) => r.top)
        const winner = top.length ? `${top.map((r) => textOf.current(r.shapeId)).join(', ')} (${top[0].count})` : null
        toast.info(describeClosed(c.openedByName, c.reason, winner))
      }
    }
  }, [panel, closed, panelStatus, toast])

  const run = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
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
    },
    [say],
  )

  const panelRef = useRef(panel)
  useEffect(() => {
    panelRef.current = panel
  }, [panel])

  const toggle = useCallback(
    async (shapeId: string) => {
      const p = panelRef.current
      if (!p || !p.shapeIds.includes(shapeId)) return
      const res = await run(() =>
        callAction<{ voted: boolean; count: number; used: number; limit: number }>('voteToggle', { panelId: p.id, shapeId }),
      )
      if (res) say(describeResult(res), 'vote')
    },
    [run, say],
  )

  const open = useCallback(
    async (shapeIds: string[], perPerson: number) =>
      !!(await run(() => callAction('votePanelOpen', { boardId, shapeIds, perPerson }))),
    [boardId, run],
  )

  const close = useCallback(async () => {
    const p = panelRef.current
    if (p) await run(() => callAction('votePanelClose', { panelId: p.id }))
  }, [run])

  // ── Your own panel: keep it alive while you're here; close it when you leave ──
  const myPanelId = panel?.mine ? panel.id : null
  useEffect(() => {
    if (!myPanelId) return
    const beat = () => void callAction('votePanelHeartbeat', { panelId: myPanelId }).catch(() => undefined)
    beat()
    const timer = setInterval(beat, HEARTBEAT_MS)
    // Leaving the page closes it now rather than when the heartbeat goes stale.
    const leave = () => void callAction('votePanelClose', { panelId: myPanelId, leaving: true }, { keepalive: true }).catch(() => undefined)
    window.addEventListener('pagehide', leave)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', leave)
    }
  }, [myPanelId])

  // ── Someone else's panel: once they've left the board, close it for them ──
  // The server only allows this after their heartbeat has stopped, so keep
  // trying while they're away (a reload brings them straight back).
  const openerAway =
    !!panel && !panel.mine && presenceConnected && !peers.some((p) => p.userId === panel.openedBy)
  const awayPanelId = openerAway ? panel!.id : null
  useEffect(() => {
    if (!awayPanelId) return
    const attempt = () => void callAction('votePanelClose', { panelId: awayPanelId }).catch(() => undefined)
    const first = setTimeout(attempt, 5_000)
    const timer = setInterval(attempt, HEARTBEAT_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [awayPanelId])

  const inPanel = useCallback((shapeId: string) => !!panel?.shapeIds.includes(shapeId), [panel])
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
      panel,
      counts,
      used,
      closed,
      specCounts,
      canOpen: canEdit && !!userId,
      busy,
      inPanel,
      toggle,
      open,
      close,
      labelSuffix,
      reveal,
      onReveal,
      announcement,
      error,
    }),
    [panel, counts, used, closed, specCounts, canEdit, userId, busy, inPanel, toggle, open, close, labelSuffix, reveal, onReveal, announcement, error],
  )
}
