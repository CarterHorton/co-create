/**
 * Vote panel controls drawn by the whiteboard:
 *   VoteMarks       — while a vote is open: an outline and a count badge on each
 *                     of its notes ("you" when one of the votes is yours —
 *                     text, not only colour).
 *   StartVoteButton — in the selection bar for two or more sticky notes: opens
 *                     a vote on them (asks how many votes each person gets).
 *   VoteButton      — in the selection bar for one note in the open vote.
 *   VotePanelCard   — the vote itself, for everyone on the board: its notes to
 *                     vote on, votes left, and Close panel for its opener; then
 *                     the results once it closes.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { Check, Crown, ThumbsUp, Vote, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button, Input, Label, Modal } from '@/components/ui'
import { Hint, KeyBadge } from '@/components/board/shortcuts'
import { shapeText } from '@/components/board/shapes'
import type { BoardShape } from '@/components/board/types'
import { DEFAULT_PER_PERSON, describeLeft, plural, type NoteVotes } from './logic'
import type { BoardVoting, ClosedPanel } from './useBoardVotes'

const btn =
  'flex h-8 items-center gap-1 border border-foreground px-2 text-xs font-bold uppercase tracking-[0.05em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

/** A note's first line, shortened, for lists. */
function noteTitle(s: BoardShape | undefined): string {
  if (!s) return 'A deleted note'
  const t = shapeText(s).split('\n')[0].trim()
  return t ? (t.length > 60 ? `${t.slice(0, 60)}…` : t) : 'Untitled note'
}

function Badge({ v }: { v: NoteVotes }) {
  return (
    <span className="flex items-center gap-1">
      <ThumbsUp className={cn('size-3', v.mine && 'fill-current')} aria-hidden />
      <span data-testid="vote-count">{v.count}</span>
      {v.mine && (
        <span className="flex items-center gap-0.5">
          · <Check className="size-3" aria-hidden /> you
        </span>
      )}
    </span>
  )
}

/** Outline + count on every note in the open vote (world coordinates). */
export function VoteMarks({ shapes, votes }: { shapes: BoardShape[]; votes: BoardVoting }) {
  if (!votes.panel) return null
  return (
    <>
      {shapes.map((s) => {
        const v = votes.counts.get(s.id)
        if (!v) return null
        return (
          <div key={s.id} aria-hidden data-testid="vote-mark" data-note={s.id}>
            <div
              className="pointer-events-none absolute border-2 border-dashed border-royal"
              style={{ left: s.x - 6, top: s.y - 6, width: s.width + 12, height: s.height + 12 }}
            />
            <div
              data-testid="vote-badge"
              data-note={s.id}
              data-mine={v.mine || undefined}
              className={cn(
                'pointer-events-none absolute flex -translate-x-3/4 -translate-y-1/2 items-center border border-foreground px-1.5 py-0.5 font-mono text-xs font-semibold shadow-[2px_2px_0_0_#000]',
                v.mine ? 'bg-foreground text-background' : 'bg-background text-foreground',
              )}
              style={{ left: s.x + s.width, top: s.y }}
            >
              <Badge v={v} />
            </div>
          </div>
        )
      })}
    </>
  )
}

/** Vote / remove your vote on the selected note (it's in the open vote). */
export function VoteButton({ shapeId, votes }: { shapeId: string; votes: BoardVoting }) {
  const mine = !!votes.counts.get(shapeId)?.mine
  const label = mine ? 'Remove your vote' : 'Vote for this note'
  return (
    <>
      <Hint label={label} shortcut="vote" side="top">
        <button
          type="button"
          data-testid="vote-toggle"
          aria-label={label}
          aria-pressed={mine}
          aria-disabled={votes.busy || undefined}
          onClick={() => {
            if (!votes.busy) void votes.toggle(shapeId)
          }}
          className={cn(btn, 'relative pr-4', mine ? 'bg-foreground text-background' : 'hover:bg-royal/20')}
        >
          <ThumbsUp className={cn('size-3.5', mine && 'fill-current')} aria-hidden /> {mine ? 'Voted' : 'Vote'}
          <KeyBadge shortcut="vote" />
        </button>
      </Hint>
      {votes.panel && (
        <span data-testid="votes-left" className="whitespace-nowrap px-1 font-mono text-xs text-muted-foreground">
          {describeLeft(votes.used, votes.panel.perPerson)}
        </span>
      )}
    </>
  )
}

/** Open a vote on the selected sticky notes. */
export function StartVoteButton({ shapeIds, votes }: { shapeIds: string[]; votes: BoardVoting }) {
  const [asking, setAsking] = useState(false)
  const [perPerson, setPerPerson] = useState(String(DEFAULT_PER_PERSON))
  const n = Number(perPerson)
  const valid = Number.isInteger(n) && n >= 1 && n <= shapeIds.length

  async function onStart(e: FormEvent) {
    e.preventDefault()
    if (valid && (await votes.open(shapeIds, n))) setAsking(false)
  }

  return (
    <>
      <Hint label="Open a vote on the selected notes" side="top">
        <button type="button" data-testid="vote-start" onClick={() => setAsking(true)} className={cn(btn, 'hover:bg-royal/20')}>
          <Vote className="size-3.5" aria-hidden /> Start vote
        </button>
      </Hint>
      <Modal open={asking} onClose={() => setAsking(false)} size="sm">
        <form onSubmit={onStart}>
          <Modal.Header>
            <Modal.Title>Vote on {plural(shapeIds.length, 'note')}</Modal.Title>
            <Modal.Description>
              Everyone on the board gets a panel to vote in. You close it when you're done, which finalizes the results.
            </Modal.Description>
          </Modal.Header>
          <Modal.Body>
            <div className="flex items-center gap-2">
              <Label htmlFor="vote-per-person">Votes per person</Label>
              <Input
                id="vote-per-person"
                data-testid="vote-per-person"
                type="number"
                inputMode="numeric"
                min={1}
                max={shapeIds.length}
                value={perPerson}
                onChange={(e) => setPerPerson(e.target.value)}
                aria-invalid={!valid || undefined}
                aria-describedby="vote-per-person-help"
                className="w-20"
              />
            </div>
            <p id="vote-per-person-help" className="mt-1 text-xs text-muted-foreground">
              From 1 to {shapeIds.length}.
            </p>
            {votes.error && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {votes.error}
              </p>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" variant="outline" onClick={() => setAsking(false)}>
              Cancel
            </Button>
            <Button type="submit" data-testid="vote-start-confirm" disabled={!valid || votes.busy}>
              Open vote
            </Button>
          </Modal.Footer>
        </form>
      </Modal>
    </>
  )
}

function ResultsList({ c, byId, onReveal }: { c: ClosedPanel; byId: Map<string, BoardShape>; onReveal: (id: string) => void }) {
  return (
    <ol className="flex flex-col gap-1" data-testid="vote-results">
      {c.ranked.map((r) => (
        <li key={r.shapeId}>
          <button
            type="button"
            data-testid="vote-result"
            data-top={r.top || undefined}
            onClick={() => onReveal(r.shapeId)}
            disabled={!byId.has(r.shapeId)}
            className="flex w-full items-center gap-2 border border-border px-2 py-1 text-left text-sm hover:bg-royal/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {r.top ? <Crown className="size-3.5 shrink-0" aria-label="Most votes" /> : <span className="size-3.5 shrink-0" />}
            <span className="min-w-0 flex-1 truncate">{noteTitle(byId.get(r.shapeId))}</span>
            <span className="font-mono text-xs font-semibold">{plural(r.count)}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

/**
 * The open vote's panel (or, once it closes, its results until dismissed),
 * floating over the board's top-left.
 */
export function VotePanelCard({ votes, shapes }: { votes: BoardVoting; shapes: BoardShape[] }) {
  const byId = new Map(shapes.map((s) => [s.id, s]))
  // Show the results of a vote that closed while you were here, until you dismiss them.
  const [watched, setWatched] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const openId = votes.panel?.id ?? null
  useEffect(() => {
    if (openId) setWatched(openId)
  }, [openId])
  const results = !votes.panel && watched && dismissed !== watched ? votes.closed.find((c) => c.id === watched) : undefined

  const shell =
    'absolute left-4 top-[116px] z-20 flex max-h-[calc(100%-180px)] w-72 flex-col gap-2 overflow-y-auto border border-foreground bg-background p-3 shadow-[4px_4px_0_0_#000] min-[1600px]:top-[68px]'
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onDoubleClick: (e: React.MouseEvent) => e.stopPropagation() }

  if (votes.panel) {
    const p = votes.panel
    return (
      <section data-testid="vote-panel" data-panel={p.id} aria-labelledby="vote-panel-title" className={shell} {...stop}>
        <div className="flex items-start gap-2">
          <Vote className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 id="vote-panel-title" className="font-display text-sm font-black">
              {p.mine ? 'Your vote' : `${p.openedByName}'s vote`}
            </h2>
            <p data-testid="vote-panel-left" className="font-mono text-xs text-muted-foreground">
              {describeLeft(votes.used, p.perPerson)}
            </p>
          </div>
        </div>
        <ul className="flex flex-col gap-1">
          {p.shapeIds.map((id) => {
            const v = votes.counts.get(id) ?? { count: 0, mine: false }
            const s = byId.get(id)
            const title = noteTitle(s)
            return (
              <li key={id} className="flex items-stretch gap-1">
                <button
                  type="button"
                  data-testid="vote-option"
                  data-note={id}
                  aria-pressed={v.mine}
                  aria-label={`${v.mine ? 'Remove your vote for' : 'Vote for'} ${title}, ${plural(v.count)}`}
                  aria-disabled={votes.busy || !s || undefined}
                  onClick={() => {
                    if (!votes.busy && s) void votes.toggle(id)
                  }}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 border border-foreground px-2 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    v.mine ? 'bg-foreground text-background' : 'hover:bg-royal/20',
                    !s && 'opacity-60',
                  )}
                >
                  <ThumbsUp className={cn('size-3.5 shrink-0', v.mine && 'fill-current')} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{title}</span>
                  <span className="font-mono text-xs font-semibold" aria-hidden>
                    {v.count}
                  </span>
                </button>
                {s && (
                  <button
                    type="button"
                    aria-label={`Show ${title} on the board`}
                    title="Show on the board"
                    onClick={() => votes.reveal(id)}
                    className="flex w-7 shrink-0 items-center justify-center border border-border text-xs hover:bg-royal/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    ↗
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        {p.mine ? (
          <Button data-testid="vote-panel-close" size="sm" onClick={() => void votes.close()} disabled={votes.busy}>
            Close panel
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{p.openedByName} will close the panel to finalize the results.</p>
        )}
        {votes.error && (
          <p role="alert" className="text-xs text-destructive">
            {votes.error}
          </p>
        )}
      </section>
    )
  }

  if (results) {
    return (
      <section data-testid="vote-panel-results" aria-labelledby="vote-results-title" className={shell} {...stop}>
        <div className="flex items-start gap-2">
          <Vote className="mt-0.5 size-4 shrink-0" aria-hidden />
          <h2 id="vote-results-title" className="min-w-0 flex-1 font-display text-sm font-black">
            Results: {results.openedByName}'s vote
          </h2>
          <button
            type="button"
            data-testid="vote-results-dismiss"
            aria-label="Dismiss the results"
            onClick={() => setDismissed(results.id)}
            className="flex size-6 shrink-0 items-center justify-center hover:bg-royal/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
        {results.reason === 'opener-left' && (
          <p className="text-xs text-muted-foreground">Closed because {results.openedByName} left the board.</p>
        )}
        <ResultsList c={results} byId={byId} onReveal={votes.reveal} />
      </section>
    )
  }
  return null
}

export { ResultsList, noteTitle }
