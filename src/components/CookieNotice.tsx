/**
 * Cookie notice — tells visitors about the one cookie Co-Create sets (the
 * sign-in session) and links to the privacy policy's cookie section.
 *
 * It's a notice, not a consent prompt: the only cookie is strictly necessary,
 * so there is nothing to accept or reject. Dismissal is remembered in
 * localStorage under COOKIE_NOTICE_KEY.
 *
 * Mounted in src/pages/_app.tsx, so it also renders during prerender: it
 * starts hidden and only reads storage after mount, so the static HTML and
 * the first client render match.
 */

import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { COOKIE_NOTICE_KEY } from '../legal'

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(COOKIE_NOTICE_KEY) === '1'
  } catch {
    // Storage blocked (hardened privacy settings): show the notice; dismissing
    // it then lasts only for this page view.
    return false
  }
}

/** Whiteboard screens keep their bottom toolbar clear; the notice shows on every other page. */
const isCanvasRoute = (path: string) => path.startsWith('/board/') || path === '/try'

export function CookieNotice() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    if (!wasDismissed()) setOpen(true)
  }, [])

  if (!open || isCanvasRoute(pathname)) return null

  const dismiss = () => {
    try {
      localStorage.setItem(COOKIE_NOTICE_KEY, '1')
    } catch {
      // See wasDismissed.
    }
    setOpen(false)
  }

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      data-testid="cookie-notice"
      className="fixed inset-x-4 bottom-4 z-[90] mx-auto flex max-w-xl flex-col gap-3 border border-border bg-background p-4 text-sm text-muted-foreground shadow-lg sm:flex-row sm:items-center"
    >
      <p className="flex-1 leading-relaxed">
        Co-Create uses one cookie, only to keep you signed in. No ads, analytics or tracking. By using Co-Create
        you agree to the{' '}
        <Link to="/terms" className="text-foreground underline underline-offset-4">
          Terms
        </Link>{' '}
        and{' '}
        <Link to="/privacy#cookies" className="text-foreground underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 border border-foreground px-4 py-2 text-xs font-bold uppercase tracking-[0.05em] text-foreground transition-colors hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Got it
      </button>
    </div>
  )
}
