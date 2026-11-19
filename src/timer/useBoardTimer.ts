/**
 * useBoardTimer — the board's shared countdown, live.
 *
 * State comes from the `board_timers` row (a live query, so everyone sees
 * changes at once); the clock offset comes from the server's `now` in the
 * timer actions (src/actions/timer.ts). `serverNow()` is this browser's best
 * guess at the server's clock, which is what `endsAt` is measured in.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from 'deepspace'
import { callAction } from '@/lib/actions'
import { estimateOffset, toTimerState, type TimerOp, type TimerState } from './timerMath'

interface TimerReply {
  now: number
  canControl: boolean
  timer: TimerState
}

/** A round trip slower than this gives a too-loose offset estimate; keep the old one. */
const MAX_SYNC_RTT_MS = 3000
/** Re-check the offset now and then, in case this machine's clock was adjusted. */
const RESYNC_MS = 5 * 60_000

export interface BoardTimer {
  /** null until the first live read. */
  timer: TimerState | null
  canControl: boolean
  /** The server's clock, as best this browser can tell. */
  serverNow: () => number
  control: (op: TimerOp, durationMs?: number) => Promise<void>
}

export function useBoardTimer(boardId: string): BoardTimer {
  const { records, status } = useQuery<Record<string, unknown>>('board_timers', { where: { boardId } })
  const [canControl, setCanControl] = useState(false)
  const offsetRef = useRef(0)
  const bestRttRef = useRef(Infinity)
  // The latest state an action told us about, shown until the live row catches up.
  const [replied, setReplied] = useState<TimerState | null>(null)

  const serverNow = useCallback(() => Date.now() + offsetRef.current, [])

  const call = useCallback(
    async (name: string, params: Record<string, unknown>) => {
      const sentAt = Date.now()
      const reply = await callAction<TimerReply>(name, { boardId, ...params })
      const receivedAt = Date.now()
      const rtt = receivedAt - sentAt
      // Prefer the tightest round trip seen; a much slower one only replaces it if it's all we have.
      if (rtt <= MAX_SYNC_RTT_MS && rtt <= bestRttRef.current * 2) {
        offsetRef.current = estimateOffset(sentAt, receivedAt, reply.now)
        bestRttRef.current = Math.min(bestRttRef.current, rtt)
      }
      setCanControl(reply.canControl)
      setReplied(toTimerState(reply.timer))
      return reply
    },
    [boardId],
  )

  useEffect(() => {
    let cancelled = false
    const sync = () => {
      if (cancelled) return
      bestRttRef.current = Infinity
      call('timerSync', {}).catch(() => undefined)
    }
    sync()
    const id = setInterval(sync, RESYNC_MS)
    const onVisible = () => document.visibilityState === 'visible' && sync()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [call])

  const control = useCallback(
    async (op: TimerOp, durationMs?: number) => {
      await call('timerControl', durationMs === undefined ? { op } : { op, durationMs })
    },
    [call],
  )

  const live = status === 'loading' ? null : toTimerState(records[0]?.data)
  let timer = live
  if (replied && (!timer || replied.rev > timer.rev)) timer = replied

  return { timer, canControl, serverNow, control }
}
