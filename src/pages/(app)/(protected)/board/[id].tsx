/**
 * /board/:id — one whiteboard. Sign-in required (the parent (protected)
 * layout gates it), because board edits are attributed to their author.
 */

import { Link, useParams } from 'react-router-dom'
import { useQuery, useUser } from 'deepspace'
import { ArrowLeft } from 'lucide-react'
import { Whiteboard } from '@/components/board/Whiteboard'
import { CallRail } from '@/components/call/CallRail'

interface Board {
  title: string
  ownerId: string
}

export default function BoardPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { records, status } = useQuery<Board>('boards', { orderBy: 'createdAt', orderDir: 'desc' })
  const board = records.find((r) => r.recordId === id)
  const { user } = useUser()

  if (status === 'loading') {
    return <div className="flex h-full items-center justify-center font-mono text-sm text-muted-foreground">Loading board…</div>
  }

  if (!board) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">This board doesn&apos;t exist or was deleted.</p>
        <Link to="/home" className="font-bold underline underline-offset-4">
          Back to boards
        </Link>
      </div>
    )
  }

  return (
    <div data-testid="board-page" className="flex h-full flex-col">
      <title>{`${board.data.title} · Co-Create`}</title>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <Link to="/home" aria-label="Back to boards" className="p-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="truncate font-display text-lg font-black tracking-[-0.01em]">{board.data.title}</h1>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <Whiteboard key={board.recordId} boardId={board.recordId} />
        </div>
        <CallRail key={board.recordId} boardId={board.recordId} displayName={user?.name || user?.email || undefined} />
      </div>
    </div>
  )
}
