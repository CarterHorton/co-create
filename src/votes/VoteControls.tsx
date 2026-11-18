/**
 * Voting controls drawn by the whiteboard:
 *   VoteBadges — a badge on each voted sticky note: its count, and "you" when
 *                one of the votes is yours (text, not only colour).
 *   VoteButton — vote / remove your vote on the selected note (selection bar).
 *   VoteBar    — the same button in its own small bar, for people who can't
 *                edit the board (viewers can vote, but get no selection bar).
 */

import { Check, ThumbsUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Hint, KeyBadge } from '@/components/board/shortcuts'
import type { BoardShape } from '@/components/board/types'
import { describeLeft } from './logic'
import type { BoardVoting } from './useBoardVotes'

export function VoteBadges({ shapes, votes }: { shapes: BoardShape[]; votes: BoardVoting }) {
  return (
    <>
      {shapes.map((s) => {
        const v = votes.counts.get(s.id)
        if (s.type !== 'sticky' || !v || v.count === 0) return null
        return (
          <div
            key={s.id}
            aria-hidden
            data-testid="vote-badge"
            data-note={s.id}
            data-mine={v.mine || undefined}
            className={cn(
              'pointer-events-none absolute flex -translate-x-3/4 -translate-y-1/2 items-center gap-1 border border-foreground px-1.5 py-0.5 font-mono text-xs font-semibold shadow-[2px_2px_0_0_#000]',
              v.mine ? 'bg-foreground text-background' : 'bg-background text-foreground',
            )}
            style={{ left: s.x + s.width, top: s.y }}
          >
            <ThumbsUp className={cn('size-3', v.mine && 'fill-current')} />
            <span data-testid="vote-count">{v.count}</span>
            {v.mine && (
              <span className="flex items-center gap-0.5">
                · <Check className="size-3" /> you
              </span>
            )}
          </div>
        )
      })}
    </>
  )
}

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
          className={cn(
            'relative flex h-8 items-center gap-1 border border-foreground px-2 pr-4 text-xs font-bold uppercase tracking-[0.05em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            mine ? 'bg-foreground text-background' : 'hover:bg-royal/20',
          )}
        >
          <ThumbsUp className={cn('size-3.5', mine && 'fill-current')} /> {mine ? 'Voted' : 'Vote'}
          <KeyBadge shortcut="vote" />
        </button>
      </Hint>
      {votes.round && (
        <span data-testid="votes-left" className="whitespace-nowrap px-1 font-mono text-xs text-muted-foreground">
          {describeLeft(votes.used, votes.round.limit)}
        </span>
      )}
    </>
  )
}

/** Keep the bar below the toolbar row. */
const BAR_MIN_TOP = 72

export function VoteBar({
  shapeId,
  votes,
  anchor,
  view,
}: {
  shapeId: string
  votes: BoardVoting
  /** The note's on-screen left edge, top and bottom (viewport px). */
  anchor: { left: number; top: number; bottom: number }
  view: { width: number; height: number }
}) {
  const height = 46
  const above = anchor.top - 28 - height
  const top = above < BAR_MIN_TOP ? Math.min(anchor.bottom + 12, Math.max(BAR_MIN_TOP, view.height - height - 16)) : above
  const left = Math.max(16, Math.min(anchor.left, Math.max(16, view.width - 260)))
  return (
    <div
      role="group"
      aria-label="Vote"
      data-testid="vote-bar"
      className="absolute z-20 flex items-center gap-2 border border-foreground bg-background p-1.5 shadow-[4px_4px_0_0_#000]"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <VoteButton shapeId={shapeId} votes={votes} />
    </div>
  )
}
