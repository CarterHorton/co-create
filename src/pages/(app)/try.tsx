/**
 * /try — guest board. No account: shapes live only in this browser's
 * localStorage (nothing is sent to the server), there's no call, and only
 * one board. Export to Markdown works the same as on a saved board.
 */

import { useState } from 'react'
import { AuthOverlay, useAuthStatus } from 'deepspace'
import { Eraser, TriangleAlert, History } from 'lucide-react'
import { Whiteboard } from '@/components/board/Whiteboard'
import { BoardSidebar } from '@/components/board/BoardSidebar'
import { useLocalBoard } from '@/components/board/useLocalBoard'
import { HistoryPanel, PreviewBanner } from '@/history/HistoryPanel'
import { useLocalHistory } from '@/history/stores'
import { formatVersionTime, useVersioning } from '@/history/useVersioning'
import { Button, ConfirmModal } from '@/components/ui'

export default function TryPage() {
  const board = useLocalBoard()
  const history = useLocalHistory()
  const v = useVersioning({ store: board, history, authorName: 'You' })
  const exportTitle = v.preview ? `${board.title} (version ${formatVersionTime(v.preview.createdAt)})` : board.title
  const { isSignedIn } = useAuthStatus()
  const [signIn, setSignIn] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  return (
    <div data-testid="try-page" className="flex h-full flex-col">
      <title>Try Co-Create</title>
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-1.5">
        <input
          data-testid="try-title"
          aria-label="Board title"
          value={board.title}
          onChange={(e) => board.setTitle(e.target.value)}
          className="min-w-0 max-w-xs flex-1 bg-transparent font-display text-lg font-black tracking-[-0.01em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <span className="font-mono text-xs text-muted-foreground">
          Guest board · saved only in this browser · no calls
        </span>
        {board.saveError && (
          <span role="alert" className="flex items-center gap-1 text-xs text-destructive">
            <TriangleAlert className="size-3.5" /> This browser blocked saving — export before you leave.
          </span>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          data-testid="try-clear"
          onClick={() => setConfirmClear(true)}
        >
          <Eraser /> Clear
        </Button>
        {!isSignedIn && (
          <Button size="sm" onClick={() => setSignIn(true)}>
            Sign in to save &amp; call
          </Button>
        )}
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <PreviewBanner v={v} canWrite />
          <div className="relative min-h-0 flex-1">
            <Whiteboard store={v.viewStore} title={exportTitle} statusLabel={v.preview ? 'Viewing past version' : 'Saved in this browser'} />
          </div>
        </div>
        <BoardSidebar panes={[{ id: 'history', label: 'History', content: <HistoryPanel v={v} canWrite />, closable: true, Icon: History }]} />
      </div>
      <ConfirmModal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          board.clear()
          setConfirmClear(false)
        }}
        title="Clear everything on this board?"
        description="You can undo with ⌘Z / Ctrl+Z, and earlier versions stay in History."
        confirmText="Clear board"
      />
      {signIn && <AuthOverlay onClose={() => setSignIn(false)} />}
    </div>
  )
}
