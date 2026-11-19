/**
 * Account settings at /settings. No auth logic lives here because
 * (protected)/_layout.tsx already wraps the subtree in <AuthGate>.
 *
 * "Delete account" calls the accountDelete action (src/actions/account.ts)
 * until it reports done, then signs out and returns to the landing page.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { signOut, useUser } from 'deepspace'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@/components/ui'
import { callAction } from '@/lib/actions'

const CONFIRM_WORD = 'DELETE'
/** Safety stop for the client loop; the server deletes 5 boards per call. */
const MAX_CALLS = 200

export default function SettingsPage() {
  const { user } = useUser()
  const [open, setOpen] = useState(false)

  return (
    // No background on page wrappers — pages render into whatever the app's
    // (app)/_layout provides (a plain background, or a raised panel), so they
    // stay transparent and inherit it.
    <div className="min-h-full text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-20">
        <h1 className="mb-12 text-4xl font-bold tracking-tight">Settings</h1>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Your account</h2>

          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="text-foreground">{user?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="text-foreground">{user?.email ?? '—'}</dd>
            </div>
          </dl>

          <Button variant="secondary" className="mt-6" onClick={() => signOut()}>
            Sign out
          </Button>
        </section>

        <section data-testid="delete-account" className="mt-8 rounded-lg border border-destructive/40 bg-card p-6">
          <h2 className="mb-2 text-lg font-semibold">Delete account</h2>
          <p className="text-sm text-muted-foreground">
            Permanently deletes your Co-Create account: every board you own (for everyone you shared it with), your
            projects, friends, and the comments, votes and history you added to other people’s boards. This can’t be
            undone. Download anything you want to keep with <em>Export .md</em> first.
          </p>
          <Button variant="destructive" className="mt-6" onClick={() => setOpen(true)}>
            Delete account…
          </Button>
        </section>

        <p className="mt-8 text-xs text-muted-foreground">
          <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
            Privacy Policy
          </Link>
          {' · '}
          <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">
            Terms of Service
          </Link>
        </p>
      </div>

      <DeleteAccountDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}

function DeleteAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = typed.trim() === CONFIRM_WORD

  const close = (next: boolean) => {
    if (busy) return
    if (!next) {
      setTyped('')
      setError(null)
    }
    onOpenChange(next)
  }

  const deleteAccount = async () => {
    setBusy(true)
    setError(null)
    try {
      for (let i = 0; ; i++) {
        if (i >= MAX_CALLS) throw new Error('Deletion is taking longer than expected. Try again to continue.')
        const { done } = await callAction<{ done: boolean }>('accountDelete', { confirm: CONFIRM_WORD })
        if (done) break
      }
      await signOut().catch(() => undefined)
      window.location.assign('/')
    } catch (err) {
      // Every step is resumable, so trying again picks up where this stopped.
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent hideClose={busy}>
        <DialogHeader>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogDescription>
            This permanently deletes all your boards, projects, friends, and everything you added to other people’s
            boards. People you shared boards with lose them too. This can’t be undone.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (ready && !busy) void deleteAccount()
          }}
        >
          <Label htmlFor="confirm-delete">
            Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
          </Label>
          <Input
            id="confirm-delete"
            autoComplete="off"
            value={typed}
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => close(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={!ready} loading={busy}>
              {busy ? 'Deleting…' : 'Delete account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
