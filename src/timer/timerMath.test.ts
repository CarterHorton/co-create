import { describe, expect, it } from 'vitest'
import {
  IDLE,
  applyOp,
  crossings,
  describeChange,
  describeDuration,
  estimateOffset,
  formatClock,
  isExpired,
  parseMinutes,
  remainingMs,
  toTimerState,
  validateDuration,
  type TimerState,
} from './timerMath'

const T0 = 1_800_000_000_000
const MIN = 60_000

function ok(r: TimerState | { error: string }): TimerState {
  if ('error' in r) throw new Error(r.error)
  return r
}

describe('remaining time', () => {
  const running = ok(applyOp(IDLE, 'start', T0, 'Alex', 5 * MIN))

  it('counts down while running', () => {
    expect(remainingMs(running, T0)).toBe(5 * MIN)
    expect(remainingMs(running, T0 + 90_000)).toBe(210_000)
    expect(isExpired(running, T0 + 90_000)).toBe(false)
  })

  it('stops at zero once expired', () => {
    expect(remainingMs(running, T0 + 5 * MIN)).toBe(0)
    expect(remainingMs(running, T0 + 10 * MIN)).toBe(0)
    expect(isExpired(running, T0 + 5 * MIN)).toBe(true)
  })

  it('freezes while paused', () => {
    const paused = ok(applyOp(running, 'pause', T0 + MIN, 'Bo'))
    expect(paused.status).toBe('paused')
    expect(remainingMs(paused, T0 + MIN)).toBe(4 * MIN)
    expect(remainingMs(paused, T0 + 60 * MIN)).toBe(4 * MIN)
    expect(isExpired(paused, T0 + 60 * MIN)).toBe(false)
    const resumed = ok(applyOp(paused, 'resume', T0 + 10 * MIN, 'Bo'))
    expect(remainingMs(resumed, T0 + 10 * MIN)).toBe(4 * MIN)
    expect(remainingMs(resumed, T0 + 11 * MIN)).toBe(3 * MIN)
  })

  it('shows the full length when idle', () => {
    expect(remainingMs({ ...IDLE, durationMs: 3 * MIN }, T0)).toBe(3 * MIN)
  })

  it('agrees across clients whose clocks are skewed', () => {
    // The server reads T0 + 5s. Client A runs 2 minutes fast, client B 47s slow;
    // both see a 100 ms round trip centred on the server's reading.
    const serverAt = T0 + 5_000
    const clients = [2 * MIN, -47_000].map((skew) => {
      const sentAt = serverAt + skew - 50
      const receivedAt = serverAt + skew + 50
      return { skew, offset: estimateOffset(sentAt, receivedAt, serverAt) }
    })
    // Later, at the same real instant, each computes remaining from its own clock + offset.
    const realNow = T0 + 2 * MIN
    const left = clients.map((c) => remainingMs(running, realNow + c.skew + c.offset))
    expect(left[0]).toBe(3 * MIN)
    expect(Math.abs(left[0] - left[1])).toBeLessThan(1000)
  })

  it('offset error is at most half the round trip', () => {
    // Server answered right at the start of a 600 ms round trip.
    const offset = estimateOffset(1000, 1600, 1000)
    expect(Math.abs(offset)).toBeLessThanOrEqual(300)
  })
})

describe('operations', () => {
  it('validates the length: 10 s to 2 h', () => {
    expect(validateDuration(10_000)).toBe(10_000)
    expect(validateDuration(120 * MIN)).toBe(120 * MIN)
    expect(validateDuration(9_999)).toHaveProperty('error')
    expect(validateDuration(120 * MIN + 1)).toHaveProperty('error')
    expect(validateDuration(Number.NaN)).toHaveProperty('error')
    expect(validateDuration('300000')).toHaveProperty('error')
    expect(applyOp(IDLE, 'start', T0, 'A')).toHaveProperty('error')
  })

  it('refuses ops that make no sense', () => {
    expect(applyOp(IDLE, 'pause', T0, 'A')).toHaveProperty('error')
    expect(applyOp(IDLE, 'resume', T0, 'A')).toHaveProperty('error')
    expect(applyOp(IDLE, 'add', T0, 'A')).toHaveProperty('error')
    const running = ok(applyOp(IDLE, 'start', T0, 'A', MIN))
    expect(applyOp(running, 'resume', T0, 'A')).toHaveProperty('error')
    expect(applyOp(running, 'pause', T0 + 2 * MIN, 'A')).toHaveProperty('error') // already up
  })

  it('adds a minute, restarting an expired timer', () => {
    const running = ok(applyOp(IDLE, 'start', T0, 'A', MIN))
    const more = ok(applyOp(running, 'add', T0 + 30_000, 'A'))
    expect(remainingMs(more, T0 + 30_000)).toBe(90_000)
    const late = ok(applyOp(running, 'add', T0 + 5 * MIN, 'A'))
    expect(remainingMs(late, T0 + 5 * MIN)).toBe(MIN)
    const paused = ok(applyOp(running, 'pause', T0 + 30_000, 'A'))
    expect(remainingMs(ok(applyOp(paused, 'add', T0 + 40_000, 'A')), T0)).toBe(90_000)
  })

  it('caps extensions at 2 hours', () => {
    const long = ok(applyOp(IDLE, 'start', T0, 'A', 120 * MIN))
    expect(remainingMs(ok(applyOp(long, 'add', T0, 'A')), T0)).toBe(120 * MIN)
  })

  it('resets to idle and bumps the revision every time', () => {
    const a = ok(applyOp(IDLE, 'start', T0, 'A', MIN))
    const b = ok(applyOp(a, 'reset', T0, 'B'))
    expect(b.status).toBe('idle')
    expect(b.durationMs).toBe(MIN)
    expect([a.rev, b.rev]).toEqual([1, 2])
    expect(b.actorName).toBe('B')
  })
})

describe('announcements', () => {
  const started = ok(applyOp(IDLE, 'start', T0, 'Alex', 5 * MIN))
  it('says who started, paused and resumed', () => {
    expect(describeChange(IDLE, started)).toBe('Timer started: 5 minutes, by Alex')
    const paused = ok(applyOp(started, 'pause', T0 + 1000, 'Bo'))
    expect(describeChange(started, paused)).toBe('Timer paused, by Bo')
    expect(describeChange(paused, ok(applyOp(paused, 'resume', T0, 'Bo')))).toBe('Timer resumed, by Bo')
  })
  it('stays quiet for no change, +1 min and reset', () => {
    expect(describeChange(started, started)).toBe('')
    expect(describeChange(started, ok(applyOp(started, 'add', T0, 'A')))).toBe('')
    expect(describeChange(started, ok(applyOp(started, 'reset', T0, 'A')))).toBe('')
  })
  it('warns once at one minute and once at zero', () => {
    expect(crossings(61_000, 60_000, 5 * MIN)).toEqual({ warn: true, done: false })
    expect(crossings(60_000, 59_000, 5 * MIN)).toEqual({ warn: false, done: false })
    expect(crossings(500, 0, 5 * MIN)).toEqual({ warn: false, done: true })
    expect(crossings(0, 0, 5 * MIN)).toEqual({ warn: false, done: false })
    // A jump straight past both (tab asleep) says only "time's up".
    expect(crossings(90_000, 0, 5 * MIN)).toEqual({ warn: false, done: true })
    // A one-minute timer doesn't warn at its own start.
    expect(crossings(60_000, 59_750, MIN).warn).toBe(false)
  })
})

describe('formatting and parsing', () => {
  it('formats the clock, rounding up', () => {
    expect(formatClock(5 * MIN)).toBe('05:00')
    expect(formatClock(59_001)).toBe('01:00')
    expect(formatClock(1)).toBe('00:01')
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(-5)).toBe('00:00')
    expect(formatClock(3_723_000)).toBe('1:02:03')
  })
  it('describes durations in words', () => {
    expect(describeDuration(MIN)).toBe('1 minute')
    expect(describeDuration(90_000)).toBe('1 minute 30 seconds')
    expect(describeDuration(45_000)).toBe('45 seconds')
  })
  it('parses custom minutes', () => {
    expect(parseMinutes('7')).toBe(7 * MIN)
    expect(parseMinutes(' 2.5 ')).toBe(150_000)
    expect(parseMinutes('0.1')).toHaveProperty('error') // 6 s
    expect(parseMinutes('121')).toHaveProperty('error')
    expect(parseMinutes('abc')).toHaveProperty('error')
    expect(parseMinutes('-3')).toHaveProperty('error')
  })
  it('normalises stored rows', () => {
    expect(toTimerState(null)).toEqual(IDLE)
    expect(toTimerState({ status: 'weird', durationMs: 'x', lastOp: 'boom' })).toEqual(IDLE)
    expect(toTimerState({ status: 'paused', durationMs: MIN, pausedRemainingMs: 1000, rev: 3 }).status).toBe('paused')
  })
})
