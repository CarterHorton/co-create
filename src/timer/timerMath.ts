/**
 * Shared countdown timer — the pure parts (no React, no DOM, no server), so
 * all of it is unit-tested.
 *
 * Time model: the server is the only clock. A running timer stores `endsAt`
 * in server epoch milliseconds; every action answers with the server's `now`,
 * and each client keeps `offset = serverNow - localNow` (estimated at the
 * midpoint of the request, see `estimateOffset`). Remaining time is then
 * `endsAt - (Date.now() + offset)` on every client, so two browsers agree to
 * within the request latency even when their own clocks are minutes apart.
 */

export const MIN_DURATION_MS = 10_000
export const MAX_DURATION_MS = 2 * 60 * 60 * 1000
export const ADD_MS = 60_000
export const PRESET_MINUTES = [1, 3, 5, 10] as const
/** The "one minute left" announcement. */
export const WARN_AT_MS = 60_000

export type TimerStatus = 'idle' | 'running' | 'paused'
export type TimerOp = 'start' | 'pause' | 'resume' | 'add' | 'reset'
export const TIMER_OPS: readonly TimerOp[] = ['start', 'pause', 'resume', 'add', 'reset']

/** One board's timer, as stored in `board_timers`. Times are server epoch ms. */
export interface TimerState {
  status: TimerStatus
  /** The length the timer was last started with (plus any +1 min). */
  durationMs: number
  /** Running: when it reaches zero. */
  endsAt: number | null
  /** Paused: what was left. */
  pausedRemainingMs: number | null
  /** Who last started, paused, resumed, extended or reset it. */
  actorName: string
  lastOp: TimerOp
  /** Bumped on every change, so "started again" is a change even if nothing else differs. */
  rev: number
}

export const IDLE: TimerState = {
  status: 'idle',
  durationMs: 5 * 60_000,
  endsAt: null,
  pausedRemainingMs: null,
  actorName: '',
  lastOp: 'reset',
  rev: 0,
}

/** Normalise a stored record (missing or odd fields become safe defaults). */
export function toTimerState(raw: Partial<Record<keyof TimerState, unknown>> | null | undefined): TimerState {
  if (!raw) return IDLE
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const status: TimerStatus = raw.status === 'running' || raw.status === 'paused' ? raw.status : 'idle'
  const lastOp = TIMER_OPS.includes(raw.lastOp as TimerOp) ? (raw.lastOp as TimerOp) : 'reset'
  return {
    status,
    durationMs: num(raw.durationMs) ?? IDLE.durationMs,
    endsAt: num(raw.endsAt),
    pausedRemainingMs: num(raw.pausedRemainingMs),
    actorName: typeof raw.actorName === 'string' ? raw.actorName : '',
    lastOp,
    rev: num(raw.rev) ?? 0,
  }
}

/** Milliseconds left at server time `serverNow`. Never negative. */
export function remainingMs(t: TimerState, serverNow: number): number {
  if (t.status === 'running') return Math.max(0, (t.endsAt ?? 0) - serverNow)
  if (t.status === 'paused') return Math.max(0, t.pausedRemainingMs ?? 0)
  return t.durationMs
}

/** Running and reached zero. */
export function isExpired(t: TimerState, serverNow: number): boolean {
  return t.status === 'running' && remainingMs(t, serverNow) === 0
}

/**
 * Clock offset (server minus local) from one round trip: the server read its
 * clock somewhere between `sentAt` and `receivedAt`; assume the midpoint.
 */
export function estimateOffset(sentAt: number, receivedAt: number, serverNow: number): number {
  return serverNow - (sentAt + receivedAt) / 2
}

/** "05:00", "1:02:03". Rounds up, so a timer shows 0:00 only once it has really ended. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`
}

/** "5 minutes", "1 minute 30 seconds", "45 seconds". */
export function describeDuration(ms: number): string {
  const total = Math.round(Math.max(0, ms) / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (m && s) return `${part(m, 'minute')} ${part(s, 'second')}`
  if (m) return part(m, 'minute')
  return part(s, 'second')
}

export type Validated<T> = T | { error: string }

/** Is `ms` an acceptable timer length? */
export function validateDuration(ms: unknown): Validated<number> {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return { error: 'Invalid duration.' }
  if (ms < MIN_DURATION_MS || ms > MAX_DURATION_MS) {
    return { error: 'Timers run from 10 seconds to 2 hours.' }
  }
  return Math.round(ms)
}

/**
 * Apply `op` at server time `now`. Pure: the server action calls this, and the
 * unit tests check every transition. Returns an error for ops that make no
 * sense in the current state (pause an idle timer, …).
 */
export function applyOp(
  t: TimerState,
  op: TimerOp,
  now: number,
  actorName: string,
  durationMs?: number,
): Validated<TimerState> {
  const next = (patch: Partial<TimerState>): TimerState => ({ ...t, ...patch, actorName, lastOp: op, rev: t.rev + 1 })
  switch (op) {
    case 'start': {
      const d = validateDuration(durationMs)
      if (typeof d !== 'number') return d
      return next({ status: 'running', durationMs: d, endsAt: now + d, pausedRemainingMs: null })
    }
    case 'pause': {
      if (t.status !== 'running') return { error: 'The timer is not running.' }
      const left = remainingMs(t, now)
      if (left === 0) return { error: "Time's already up." }
      return next({ status: 'paused', endsAt: null, pausedRemainingMs: left })
    }
    case 'resume': {
      if (t.status !== 'paused') return { error: 'The timer is not paused.' }
      return next({ status: 'running', endsAt: now + (t.pausedRemainingMs ?? 0), pausedRemainingMs: null })
    }
    case 'add': {
      if (t.status === 'idle') return { error: 'Start the timer first.' }
      const left = Math.min(remainingMs(t, now) + ADD_MS, MAX_DURATION_MS)
      const durationMs = Math.min(t.durationMs + ADD_MS, MAX_DURATION_MS)
      // An expired timer restarts with the extra minute.
      if (t.status === 'running') return next({ durationMs, endsAt: now + left })
      return next({ durationMs, pausedRemainingMs: left })
    }
    case 'reset':
      return next({ status: 'idle', endsAt: null, pausedRemainingMs: null })
  }
}

/**
 * What to tell screen readers when the stored timer changes from `prev` to
 * `next` (both null-safe); '' when nothing worth saying happened. Ticking is
 * never announced: only start, pause and resume (WCAG 2.2.1 / 4.1.3).
 * The one-minute warning and "Time's up" come from `crossings`.
 */
export function describeChange(prev: TimerState, next: TimerState): string {
  if (next.rev === prev.rev) return ''
  const by = next.actorName ? `, by ${next.actorName}` : ''
  switch (next.lastOp) {
    case 'start':
      return `Timer started: ${describeDuration(next.durationMs)}${by}`
    case 'pause':
      return `Timer paused${by}`
    case 'resume':
      return `Timer resumed${by}`
    default:
      return ''
  }
}

/** Thresholds passed while time went from `before` to `after` ms left (running only). */
export function crossings(before: number, after: number, durationMs: number): { warn: boolean; done: boolean } {
  return {
    // Only warn when the timer was ever longer than the warning itself.
    warn: durationMs > WARN_AT_MS && before > WARN_AT_MS && after <= WARN_AT_MS && after > 0,
    done: before > 0 && after === 0,
  }
}

/** Parse the custom-minutes field: whole or decimal minutes, within the allowed range. */
export function parseMinutes(text: string): Validated<number> {
  const trimmed = text.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { error: 'Enter minutes as a number.' }
  const ms = Math.round(Number(trimmed) * 60_000)
  return validateDuration(ms)
}
