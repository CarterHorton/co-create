/**
 * /board/:id — one whiteboard. Sign-in required (the parent (protected)
 * layout gates it), because board edits are attributed to their author.
 */

import { Link, useParams } from 'react-router-dom'
import { useMemo } from 'react'
import { useMutations, usePresenceRoom, useQuery, useUser } from 'deepspace'
import type { SpecPublisher } from '@/components/board/ExportDialog'
import { ArrowLeft, History } from 'lucide-react'
import { Whiteboard } from '@/components/board/Whiteboard'
import { BoardSidebar } from '@/components/board/BoardSidebar'
import { useBoard } from '@/components/board/useBoard'
import { CallRail } from '@/components/call/CallRail'
import { ShareMenu } from '@/components/sharing/ShareMenu'
import { HistoryPanel, PreviewBanner } from '@/history/HistoryPanel'
import { useCloudHistory } from '@/history/stores'
import { formatVersionTime, useVersioning } from '@/history/useVersioning'

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
        <p className="text-muted-foreground">This board doesn&apos;t exist, was deleted, or hasn&apos;t been shared with you.</p>
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
        {user && <ShareMenu boardId={board.recordId} userId={user.id} isOwner={board.data.ownerId === user.id} />}
      </header>
      <BoardWorkspace
        key={board.recordId}
        boardId={board.recordId}
        title={board.data.title}
        userName={user?.name || user?.email || 'Someone'}
      />
    </div>
  )
}

/** Board + call + history for one board (keyed by board, so state resets per board). */
function BoardWorkspace({ boardId, title, userName }: { boardId: string; title: string; userName: string }) {
  const store = useBoard(boardId)
  const presence = usePresenceRoom(`board:${boardId}`)
  const history = useCloudHistory(boardId)
  const v = useVersioning({ store, history, authorName: userName })
  const exportTitle = v.preview ? `${title} (version ${formatVersionTime(v.preview.createdAt)})` : title
  const { createConfirmed: createSpec } = useMutations<{ boardId: string; title: string; markdown: string; authorName: string }>('specs')
  const publisher = useMemo<SpecPublisher>(
    () => ({
      publish: async ({ title: t, markdown }) => {
        await createSpec({ boardId, title: t, markdown, authorName: userName })
      },
      fetchCommand: `npx deepspace agent invoke co-create spec_get --input '{"boardId":"${boardId}"}' --json`,
    }),
    [createSpec, boardId, userName],
  )

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <PreviewBanner v={v} canWrite={store.canWrite} />
        <div className="relative min-h-0 flex-1">
          <Whiteboard
            store={v.viewStore}
            title={exportTitle}
            presence={presence}
            statusLabel={v.preview ? 'Viewing past version' : undefined}
            publisher={publisher}
          />
        </div>
      </div>
      <BoardSidebar
        panes={[
          { id: 'call', label: 'Call', content: <CallRail boardId={boardId} displayName={userName} /> },
          {
            id: 'history',
            label: 'History',
            badge: v.unsaved ? <span aria-label="unsaved changes" className="size-1.5 bg-royal/50" /> : null,
            content: <HistoryPanel v={v} canWrite={store.canWrite} />,
            closable: true,
            Icon: History,
          },
        ]}
      />
    </div>
  )
}
