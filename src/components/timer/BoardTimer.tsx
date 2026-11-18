/**
 * BoardTimer — the shared countdown in the board header. One per board, the
 * same for everyone (src/timer/useBoardTimer.ts). Editors pick a length and
 * start / pause / resume / extend / reset it; viewers just watch.
 *
 * Accessibility: the ticking digits are aria-hidden. Screen readers hear only
 * start, pause, resume, "1 minute left" and "Time's up" through a polite
 * live region (WCAG 2.2.1 / 4.1.3). At zero the button is highlighted and
 * says "Time's up" in words, so the state never relies on colour alone.
 */

import { useEffect, useId, useRef, useState } from 'react'
import { BellRing, Pause, Play, Plus, RotateCcw, Timer as TimerIcon } from 'lucide-react'
import { Button, Input, Label, Popover, PopoverContent, PopoverTrigger, Switch, cn, useToast } from '@/components/ui'
import { LiveRegion, useAnnouncer } from '@/components/board/LiveRegion'
import {
  PRESET_MINUTES,
  crossings,
  describeChange,
  describeDuration,
  formatClock,
  isExpired,
  parseMinutes,
  remainingMs,
  type TimerOp,
  type TimerState,
} from '@/timer/timerMath'
import { useBoardTimer } from '@/timer/useBoardTimer'
import { loadChimePref, playChime, primeAudio, saveChimePref } from '@/timer/chime'

const TICK_MS = 250

export function BoardTimer({ boardId }: { boardId: string }) {
  const { timer, canControl, serverNow, control } = useBoardTimer(boardId)
  const { error } = useToast()
  const { message, say } = useAnnouncer()
  const [now, setNow] = useState(() => serverNow())
  const [chime, setChime] = useState(loadChimePref)
  const [busy, setBusy] = useState<TimerOp | null>(null)
  const [pick, setPick] = useState(5 * 60_000)
  const [custom, setCustom] = useState('')
  const customId = useId()
  const customErrId = useId()
  const chimeId = useId()

  const running = timer?.status === 'running'
  // Tick only while running; a paused or idle timer doesn't change.
  useEffect(() => {
    setNow(serverNow())
    if (!running) return
    const id = setInterval(() => setNow(serverNow()), TICK_MS)
    return () => clearInterval(id)
  }, [running, serverNow, timer?.rev])

  const left = timer ? remainingMs(timer, now) : 0
  const expired = timer ? isExpired(timer, now) : false

  // Announce changes made by anyone, but not what was already there on load.
  const prevRef = useRef<TimerState | null>(null)
  useEffect(() => {
    if (!timer) return
    const prev = prevRef.current
    prevRef.current = timer
    if (prev) {
      const text = describeChange(prev, timer)
      if (text) say(text, 'timer')
    }
  }, [timer, say])

  // One-minute warning and time's up, when the countdown crosses them while open.
  const lastLeftRef = useRef<{ rev: number; left: number } | null>(null)
  const chimeRef = useRef(chime)
  useEffect(() => {
    chimeRef.current = chime
  }, [chime])
  useEffect(() => {
    if (!timer) return
    const last = lastLeftRef.current
    lastLeftRef.current = { rev: timer.rev, left }
    if (!last || last.rev !== timer.rev || timer.status !== 'running') return
    const c = crossings(last.left, left, timer.durationMs)
    if (c.warn) say('1 minute left on the timer', 'timer-warn')
    if (c.done) {
      say("Time's up", 'timer-done')
      if (chimeRef.current) playChime()
    }
  }, [timer, left, say])

  async function run(op: TimerOp, durationMs?: number) {
    setBusy(op)
    try {
      await control(op, durationMs)
    } catch (e) {
      error('Timer', (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const customParsed = custom.trim() ? parseMinutes(custom) : null
  const customError = customParsed && typeof customParsed !== 'number' ? customParsed.error : null
  const chosen = typeof customParsed === 'number' ? customParsed : pick

  const status = !timer ? 'Loading' : expired ? "Time's up" : timer.status === 'running' ? 'Running' : timer.status === 'paused' ? 'Paused' : 'Ready'
  // A coarse, non-live summary for the button's name: whole minutes, so it doesn't change every second.
  const roughLeft = left >= 60_000 ? `about ${describeDuration(Math.round(left / 60_000) * 60_000)} left` : 'under a minute left'
  const summary =
    !timer || timer.status === 'idle' ? 'not running' : expired ? "time's up" : `${timer.status === 'paused' ? 'paused' : 'running'}, ${roughLeft}`
  const active = timer && timer.status !== 'idle'

  return (
    <>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              data-testid="timer-open"
              data-status={expired ? 'expired' : (timer?.status ?? 'loading')}
              variant="outline"
              size="sm"
              aria-label={`Board timer: ${summary}`}
              className={cn('gap-1.5 font-mono tabular-nums', expired && 'border-royal/50 bg-royal/30 motion-safe:animate-pulse')}
            >
              {expired ? <BellRing className="size-3.5" aria-hidden /> : <TimerIcon className="size-3.5" aria-hidden />}
              {active ? (
                <span aria-hidden data-testid="timer-display">
                  {expired ? "Time's up" : formatClock(left)}
                </span>
              ) : (
                <span aria-hidden>Timer</span>
              )}
              {timer?.status === 'paused' && <Pause className="size-3" aria-hidden data-testid="timer-paused-icon" />}
            </Button>
          }
        />
        <PopoverContent align="end" className="w-80 rounded-none p-4" data-testid="timer-menu">
          <h3 className="mb-1 text-sm font-bold">Board timer</h3>
          <p className="mb-3 flex items-baseline justify-between gap-2">
            <span aria-hidden className="font-mono text-3xl font-black tabular-nums" data-testid="timer-big">
              {formatClock(left)}
            </span>
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground" data-testid="timer-status">
              {status}
            </span>
          </p>
          {timer?.actorName && timer.status !== 'idle' && (
            <p className="mb-3 text-xs text-muted-foreground">
              {timer.status === 'paused' ? 'Paused' : 'Started'} by {timer.actorName}
            </p>
          )}

          {canControl ? (
            <>
              <fieldset className="mb-3">
                <legend className="mb-1.5 text-xs font-bold">Length</legend>
                <div className="mb-2 flex gap-1">
                  {PRESET_MINUTES.map((m) => (
                    <Button
                      key={m}
                      variant="outline"
                      size="sm"
                      className={cn('flex-1 rounded-none', !custom.trim() && pick === m * 60_000 && 'border-foreground bg-royal/20')}
                      aria-pressed={!custom.trim() && pick === m * 60_000}
                      data-testid={`timer-preset-${m}`}
                      onClick={() => {
                        setPick(m * 60_000)
                        setCustom('')
                      }}
                    >
                      {m} min
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={customId} className="shrink-0 text-xs">
                    Custom minutes
                  </Label>
                  <Input
                    id={customId}
                    data-testid="timer-custom"
                    inputMode="decimal"
                    placeholder="e.g. 7"
                    value={custom}
                    onChange={(e) => setCustom(e.target.value.slice(0, 8))}
                    aria-invalid={customError ? true : undefined}
                    aria-describedby={customError ? customErrId : undefined}
                    className="h-8 rounded-none"
                  />
                </div>
                {customError && (
                  <p id={customErrId} className="mt-1 text-xs text-destructive">
                    {customError}
                  </p>
                )}
              </fieldset>

              <div className="mb-3 grid grid-cols-2 gap-1">
                <Button
                  size="sm"
                  className="rounded-none"
                  data-testid="timer-start"
                  disabled={!!customError || busy !== null}
                  loading={busy === 'start'}
                  onClick={() => run('start', chosen)}
                >
                  <Play aria-hidden /> {active ? 'Restart' : 'Start'} {describeDuration(chosen)}
                </Button>
                {timer?.status === 'paused' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-none"
                    data-testid="timer-resume"
                    disabled={busy !== null}
                    loading={busy === 'resume'}
                    onClick={() => run('resume')}
                  >
                    <Play aria-hidden /> Resume
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-none"
                    data-testid="timer-pause"
                    disabled={!running || expired || busy !== null}
                    loading={busy === 'pause'}
                    onClick={() => run('pause')}
                  >
                    <Pause aria-hidden /> Pause
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  data-testid="timer-add"
                  aria-label="Add 1 minute"
                  disabled={!active || busy !== null}
                  loading={busy === 'add'}
                  onClick={() => run('add')}
                >
                  <Plus aria-hidden /> 1 min
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  data-testid="timer-reset"
                  disabled={!active || busy !== null}
                  loading={busy === 'reset'}
                  onClick={() => run('reset')}
                >
                  <RotateCcw aria-hidden /> Reset
                </Button>
              </div>
            </>
          ) : (
            <p className="mb-3 text-xs text-muted-foreground" data-testid="timer-readonly">
              Only editors can control the timer.
            </p>
          )}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            <Label htmlFor={chimeId} className="text-xs">
              Chime when time&apos;s up
            </Label>
            <Switch
              id={chimeId}
              data-testid="timer-chime"
              checked={chime}
              onCheckedChange={(on) => {
                setChime(on)
                saveChimePref(on)
                // This click is a user gesture: unlock audio now so the chime can play later.
                if (on) primeAudio()
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
      <LiveRegion message={message} testId="timer-live" />
    </>
  )
}
