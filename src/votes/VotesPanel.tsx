/**
 * The board sidebar's Votes pane: the dot-voting round (the owner starts and
 * ends it), and the "Top voted" notes — clicking one pans the board to it.
 */

import { useMemo, useState, type FormEvent } from 'react'
import { Check, ThumbsUp } from 'lucide-react'
import { Button, Checkbox, ConfirmModal, Label } from '@/components/ui'
import { readingOrder } from '@/components/board/a11y'
import { shapeText } from '@/components/board/shapes'
import type { BoardShape } from '@/components/board/types'
import { DEFAULT_ROUND_LIMIT, MAX_ROUND_LIMIT, describeLeft, plural, topVoted } from './logic'
import type { BoardVoting } from './useBoardVotes'

type Confirm = 'end' | 'clear' | null

export function VotesPanel({ votes, shapes }: { votes: BoardVoting; shapes: BoardShape[] }) {
  const notes = useMemo(() => readingOrder(shapes).filter((s) => s.type === 'sticky'), [shapes])
  const top = useMemo(() => topVoted(notes, votes.counts), [notes, votes.counts])
  const anyVotes = votes.counts.size > 0
  const [limit, setLimit] = useState(String(DEFAULT_ROUND_LIMIT))
  const [clear, setClear] = useState(true)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const n = Number(limit)
  const validLimit = Number.isInteger(n) && n >= 1 && n <= MAX_ROUND_LIMIT

  function onStart(e: FormEvent) {
    e.preventDefault()
    if (validLimit) void votes.startRound(n, anyVotes && clear)
  }

  async function onConfirm() {
    if (confirm === 'end') await votes.endRound()
    if (confirm === 'clear') await votes.clearVotes()
    setConfirm(null)
  }

  return (
    <div data-testid="votes-panel" className="flex min-h-0 flex-1 flex-col">
      <section aria-label="Voting round" className="flex flex-col gap-2 border-b border-border p-3">
        {votes.round ? (
          <>
            <p data-testid="vote-round-status" className="text-sm font-semibold">
              Dot-voting round: {plural(votes.round.limit)} per person
            </p>
            <p data-testid="vote-round-left" className="font-mono text-xs text-muted-foreground">
              You have {describeLeft(votes.used, votes.round.limit)}.
            </p>
          </>
        ) : (
          <p data-testid="vote-round-status" className="text-sm text-muted-foreground">
            Votes are unlimited. Select a sticky note and press U (or Vote) to vote for it.
          </p>
        )}

        {votes.isOwner && !votes.round && (
          <form onSubmit={onStart} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="vote-round-limit" className="text-xs">
                Votes per person
              </Label>
              <input
                id="vote-round-limit"
                data-testid="vote-round-limit"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_ROUND_LIMIT}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                aria-invalid={!validLimit || undefined}
                className="h-8 w-16 border border-input bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </div>
            {anyVotes && (
              <div className="flex items-center gap-2">
                <Checkbox id="vote-round-clear" data-testid="vote-round-clear" checked={clear} onCheckedChange={setClear} />
                <Label htmlFor="vote-round-clear" className="text-xs">
                  Clear current votes first
                </Label>
              </div>
            )}
            <Button data-testid="vote-round-start" type="submit" size="sm" disabled={!validLimit} loading={votes.busy}>
              Start dot-voting round
            </Button>
          </form>
        )}
        {votes.isOwner && (votes.round || anyVotes) && (
          <div className="flex flex-wrap gap-2">
            {votes.round && (
              <Button data-testid="vote-round-end" size="sm" variant="outline" onClick={() => setConfirm('end')}>
                End round
              </Button>
            )}
            {anyVotes && (
              <Button data-testid="vote-clear" size="sm" variant="outline" onClick={() => setConfirm('clear')}>
                Clear all votes
              </Button>
            )}
          </div>
        )}
        {votes.error && (
          <p role="alert" data-testid="vote-error" className="border border-destructive/40 p-2 text-xs text-destructive">
            {votes.error}
          </p>
        )}
      </section>

      <section aria-labelledby="top-voted-heading" className="min-h-0 flex-1 overflow-y-auto">
        <h2 id="top-voted-heading" className="px-4 pb-1 pt-3 font-mono text-xs font-semibold uppercase tracking-[0.05em]">
          Top voted
        </h2>
        {top.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <ThumbsUp className="size-5" aria-hidden />
            No votes yet.
          </div>
        ) : (
          <ol data-testid="top-voted-list">
            {top.map(({ note, count, mine }, i) => {
              const text = shapeText(note).replace(/\s+/g, ' ').trim() || 'Empty note'
              return (
                <li key={note.id}>
                  <button
                    type="button"
                    data-testid="top-voted-item"
                    aria-label={`${i + 1}. ${text}, ${plural(count)}${mine ? ', including yours' : ''}. Show on board`}
                    onClick={() => votes.reveal(note.id)}
                    className="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-royal/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="font-mono text-xs font-semibold text-muted-foreground">{i + 1}.</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-sm font-semibold leading-snug">{text}</span>
                      <span className="mt-1 flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                        <ThumbsUp className="size-3" aria-hidden /> {plural(count)}
                        {mine && (
                          <>
                            {' '}
                            · <Check className="size-3" aria-hidden /> you voted
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => void onConfirm()}
        loading={votes.busy}
        title={confirm === 'end' ? 'End the voting round?' : 'Clear all votes?'}
        description={
          confirm === 'end'
            ? 'The vote limit is lifted. Votes cast so far stay on the board.'
            : "Every vote on this board is removed, for everyone. This can't be undone."
        }
        confirmText={confirm === 'end' ? 'End round' : 'Clear votes'}
        variant={confirm === 'end' ? 'default' : 'destructive'}
      />
    </div>
  )
}
