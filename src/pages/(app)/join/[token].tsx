/**
 * /join/:token — open a board through a view-only link (src/actions/links.ts).
 *
 * Signed-out visitors sign in here (the URL stays /join/<token>, so they land
 * back on this page and the link is redeemed straight after). Signed-in
 * visitors redeem once and are sent to the board; a bad, expired or revoked
 * link shows a clear message instead.
 */

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AuthOverlay, useAuthStatus } from 'deepspace'
import { Link2Off } from 'lucide-react'
import { Button } from '@/components/ui'
import { callAction } from '@/lib/actions'

type JoinState = { kind: 'joining' } | { kind: 'error'; message: string }

export default function JoinPage() {
  const { token = '' } = useParams<{ token: string }>()
  const { isLoaded, isSignedIn } = useAuthStatus()

  if (!isLoaded) return null
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-20">
      <title>Join board · Co-Create</title>
      <meta name="robots" content="noindex" />
      <div className="w-full max-w-sm border border-border bg-card p-8 text-center" data-testid="join-page">
        {isSignedIn ? <Redeem token={token} /> : <SignedOut />}
      </div>
    </div>
  )
}

function SignedOut() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <h1 className="font-display text-lg font-black">Sign in to view this board</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Someone shared a view-only link with you. Sign in and you&apos;ll go straight to the board.
      </p>
      <Button className="mt-6 w-full" data-testid="join-sign-in" onClick={() => setOpen(true)}>
        Sign in
      </Button>
      {open && <AuthOverlay onClose={() => setOpen(false)} />}
    </>
  )
}

function Redeem({ token }: { token: string }) {
  const navigate = useNavigate()
  const [state, setState] = useState<JoinState>({ kind: 'joining' })
  const started = useRef(false)

  useEffect(() => {
    // Once per mount: StrictMode re-runs effects, and each failed try counts
    // towards the per-user attempt limit.
    if (started.current) return
    started.current = true
    callAction<{ boardId: string }>('boardLinkRedeem', { token })
      .then(({ boardId }) => navigate(`/board/${boardId}`, { replace: true }))
      .catch((e: unknown) =>
        setState({ kind: 'error', message: e instanceof Error ? e.message : 'This link could not be opened.' }),
      )
  }, [token, navigate])

  if (state.kind === 'joining') {
    return (
      <p role="status" className="font-mono text-sm text-muted-foreground" data-testid="join-status">
        Opening board…
      </p>
    )
  }
  return (
    <div role="alert" data-testid="join-error">
      <Link2Off aria-hidden="true" className="mx-auto mb-3 size-6 text-muted-foreground" />
      <h1 className="font-display text-lg font-black">Can&apos;t open this link</h1>
      <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
      <Link
        to="/home"
        className="mt-6 inline-block text-sm font-bold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Back to your boards
      </Link>
    </div>
  )
}
