/**
 * Boards — the signed-in home. Lists your boards and the ones friends sent
 * you (boards are private until sent), creates new ones, manages your party,
 * and opens /board/:id. Signed-out visitors get a sign-in prompt instead.
 */

import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, useMutations, useQuery, ROLES } from 'deepspace'
import { ArrowRight, Trash2 } from 'lucide-react'
import { Button, Input, useToast } from '@/components/ui'
import { PartyPanel } from '@/components/sharing/PartyPanel'
import { callAction } from '@/lib/actions'

interface Board {
  title: string
  ownerId: string
}

export default function HomePage() {
  const { isLoaded, isSignedIn, user } = useAuthProfileReady({ requireUser: true })

  if (!isLoaded) return null
  if (!isSignedIn || !user) return <SignedOut />
  return <BoardList userId={user.id} role={user.role} />
}

function SignedOut() {
  const [open, setOpen] = useState(false)
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-6 px-6 py-24">
      <h1 className="font-display text-4xl font-black tracking-[-0.02em]">Your boards</h1>
      <p className="text-base text-muted-foreground">
        Sign in to create a whiteboard and invite your team onto it.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={() => setOpen(true)}>Sign in</Button>
        <Link to="/try" data-testid="try-link" className="text-sm font-bold underline underline-offset-4 hover:text-royal">
          Try it without an account
        </Link>
      </div>
      <p className="font-mono text-xs text-muted-foreground">
        Guest boards stay in this browser only — no saving to the cloud, no calls, but Markdown export works.
      </p>
      {open && <AuthOverlay onClose={() => setOpen(false)} />}
    </div>
  )
}

function BoardList({ userId, role }: { userId: string; role?: string }) {
  const navigate = useNavigate()
  const { error } = useToast()
  const { records: boards, status } = useQuery<Board>('boards', {
    orderBy: 'createdAt',
    orderDir: 'desc',
  })
  const { createConfirmed } = useMutations<Board>('boards')
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const canCreate = role !== ROLES.VIEWER

  /** Server-side so the board's versions, specs, access rows and canvas go too. */
  async function deleteBoard(boardId: string) {
    try {
      await callAction('boardDelete', { boardId })
    } catch (err) {
      error('Could not delete board', err instanceof Error ? err.message : String(err))
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    setCreating(true)
    try {
      const id = await createConfirmed({ title: t, ownerId: userId })
      setTitle('')
      navigate(`/board/${id}`)
    } catch (err) {
      error('Could not create board', String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div data-testid="boards-page" className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="mb-8 font-display text-4xl font-black tracking-[-0.02em]">Boards</h1>

      <PartyPanel userId={userId} />

      {canCreate && (
        <form onSubmit={onCreate} className="mb-10 flex gap-2">
          <Input
            data-testid="board-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name a new board — e.g. Onboarding redesign"
            className="flex-1"
          />
          <Button data-testid="board-create" type="submit" loading={creating} disabled={!title.trim()}>
            New board
          </Button>
        </form>
      )}

      {status === 'loading' ? (
        <p className="text-sm text-muted-foreground">Loading boards…</p>
      ) : boards.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No boards yet. Name one above to start, or ask a friend to send you one.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {boards.map((b) => {
            const mine = b.data.ownerId === userId
            return (
              <li key={b.recordId} className="group relative">
                <Link
                  to={`/board/${b.recordId}`}
                  data-testid={`board-card-${b.recordId}`}
                  className="flex items-center justify-between gap-4 border border-border bg-background p-5 transition-colors hover:border-royal/50"
                >
                  <div className="min-w-0">
                    <h2 className="truncate font-bold">{b.data.title}</h2>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {new Date(b.createdAt).toLocaleDateString()}
                      {mine ? ' · yours' : ' · shared with you'}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
                </Link>
                {mine && (
                  <button
                    type="button"
                    aria-label={`Delete ${b.data.title}`}
                    onClick={() => {
                      if (confirm(`Delete "${b.data.title}"? This can't be undone.`)) void deleteBoard(b.recordId)
                    }}
                    className="absolute right-12 top-1/2 -translate-y-1/2 p-2 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
