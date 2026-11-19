/**
 * The board sidebar's Votes pane: how to start a vote, the open one (if any),
 * and the results of past votes — clicking a note pans the board to it.
 */

import { Vote } from 'lucide-react'
import type { BoardShape } from '@/components/board/types'
import { describeLeft, plural } from './logic'
import { ResultsList } from './VoteControls'
import type { BoardVoting } from './useBoardVotes'

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function VotesPanel({ votes, shapes }: { votes: BoardVoting; shapes: BoardShape[] }) {
  const byId = new Map(shapes.map((s) => [s.id, s]))
  const p = votes.panel
  return (
    <div data-testid="votes-panel" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <section aria-label="Current vote" className="flex flex-col gap-1 border-b border-border p-3">
        {p ? (
          <>
            <p data-testid="vote-status" className="text-sm font-semibold">
              {p.mine ? 'Your vote' : `${p.openedByName}'s vote`} is open: {plural(p.shapeIds.length, 'note')}
            </p>
            <p className="font-mono text-xs text-muted-foreground">You have {describeLeft(votes.used, p.perPerson)}.</p>
          </>
        ) : (
          <p data-testid="vote-status" className="text-sm text-muted-foreground">
            {votes.canOpen
              ? 'Select two or more sticky notes and choose Start vote. Everyone on the board can vote until you close it.'
              : 'No vote is open. Someone who can edit the board can start one.'}
          </p>
        )}
      </section>
      <section aria-labelledby="past-votes" className="flex flex-col gap-3 p-3">
        <h3 id="past-votes" className="font-mono text-xs font-semibold uppercase tracking-[0.05em]">
          Past votes
        </h3>
        {votes.closed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No finished votes yet.</p>
        ) : (
          votes.closed.map((c) => (
            <div key={c.id} data-testid="past-vote" className="flex flex-col gap-1.5">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Vote className="size-3.5" aria-hidden />
                {c.openedByName} · {when(c.closedAt)}
                {c.reason === 'opener-left' && ' · closed when they left'}
              </p>
              <ResultsList c={c} byId={byId} onReveal={votes.reveal} />
            </div>
          ))
        )}
      </section>
    </div>
  )
}
