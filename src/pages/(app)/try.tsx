/**
 * /try — guest board. No account: shapes live only in this browser's
 * localStorage (nothing is sent to the server), there's no call, and only
 * one board. Export to Markdown works the same as on a saved board.
 */

import { useState } from 'react'
import { AuthOverlay, useAuthStatus } from 'deepspace'
import { Eraser, TriangleAlert } from 'lucide-react'
import { Whiteboard } from '@/components/board/Whiteboard'
import { useLocalBoard } from '@/components/board/useLocalBoard'
import { Button } from '@/components/ui'

export default function TryPage() {
  const board = useLocalBoard()
  const { isSignedIn } = useAuthStatus()
  const [signIn, setSignIn] = useState(false)

  return (
    <div data-testid="try-page" className="flex h-full flex-col">
      <title>Try Co-Create</title>
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-1.5">
        <input
          data-testid="try-title"
          aria-label="Board title"
          value={board.title}
          onChange={(e) => board.setTitle(e.target.value)}
          className="min-w-0 max-w-xs flex-1 bg-transparent font-display text-lg font-black tracking-[-0.01em] outline-none focus-visible:underline"
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
          onClick={() => {
            if (confirm('Clear everything on this board? You can undo with ⌘Z / Ctrl+Z.')) board.clear()
          }}
        >
          <Eraser /> Clear
        </Button>
        {!isSignedIn && (
          <Button size="sm" onClick={() => setSignIn(true)}>
            Sign in to save &amp; call
          </Button>
        )}
      </header>
      <div className="relative min-h-0 flex-1">
        <Whiteboard store={board} title={board.title} statusLabel="Saved in this browser" />
      </div>
      {signIn && <AuthOverlay onClose={() => setSignIn(false)} />}
    </div>
  )
}
