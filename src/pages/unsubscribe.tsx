/**
 * /unsubscribe?t=<token> — where the link in every notification email lands.
 *
 * A STATIC page (top level of src/pages/, no auth providers): no sign-in
 * needed, the token is the proof. It asks for one click rather than
 * unsubscribing on load, so mail scanners that open links don't unsubscribe
 * people by accident. Not prerendered: it only makes sense with a token.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

type State = 'ready' | 'working' | 'done' | 'error'

export default function Unsubscribe() {
  const [token, setToken] = useState<string | null>(null)
  const [state, setState] = useState<State>('ready')
  const [error, setError] = useState('')

  useEffect(() => {
    // '' = the link has no code; null (initial) = not read yet.
    setToken(new URLSearchParams(window.location.search).get('t') ?? '')
  }, [])

  const unsubscribe = async () => {
    setState('working')
    try {
      const res = await fetch('/api/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null
      if (!res.ok || !body?.success) throw new Error(body?.error || 'Something went wrong. Try again.')
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState('error')
    }
  }

  return (
    <>
      <Seo
        title="Unsubscribe | Co-Create"
        description="Stop Co-Create notification emails."
        origin={seo.origin}
        path="/unsubscribe"
        noindex
      />
      <main data-testid="unsubscribe-page" className="mx-auto max-w-md px-6 py-24 text-foreground">
        <Link to="/" className="font-display text-sm font-black tracking-[-0.02em]">
          Co-Create
        </Link>
        <h1 className="mt-8 font-display text-3xl font-black tracking-[-0.02em]">
          {state === 'done' ? "You're unsubscribed" : 'Unsubscribe from emails'}
        </h1>
        {state === 'done' ? (
          <p className="mt-4 text-muted-foreground" role="status">
            You won't get any more emails from Co-Create. Changed your mind? Turn them back on in{' '}
            <Link to="/settings" className="text-foreground underline underline-offset-4">
              Settings
            </Link>
            .
          </p>
        ) : (
          <>
            <p className="mt-4 text-muted-foreground">
              Stop all Co-Create emails, like notices when someone shares a board with you or adds you as a friend.
            </p>
            {token === null ? null : !token ? (
              <p className="mt-6 text-sm text-destructive" role="alert">
                This link is missing its code. Use the unsubscribe link from the email, or turn emails off in Settings.
              </p>
            ) : (
              <button
                type="button"
                data-testid="unsubscribe-confirm"
                onClick={unsubscribe}
                disabled={state === 'working'}
                className="mt-8 border border-foreground px-6 py-3 text-sm font-bold uppercase tracking-[0.05em] hover:bg-foreground hover:text-background disabled:opacity-50"
              >
                {state === 'working' ? 'Unsubscribing…' : 'Unsubscribe'}
              </button>
            )}
            {state === 'error' && (
              <p className="mt-4 text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </main>
    </>
  )
}
