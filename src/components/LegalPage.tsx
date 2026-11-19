/**
 * Shared layout for the static legal pages (src/pages/privacy.tsx,
 * src/pages/terms.tsx): header, last-updated line, sections, footer links.
 * Safe to prerender: it touches the DOM only inside an effect.
 */

import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PRIVACY_CONTACT_EMAIL } from '../legal'

export function LegalPage({
  testId,
  title,
  updated,
  children,
}: {
  testId: string
  title: string
  updated: string
  children: ReactNode
}) {
  // In-app links like /privacy#cookies navigate client-side, and React Router
  // doesn't scroll to the hash; do it once the page is rendered.
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'instant' })
  }, [hash])

  return (
    <main data-testid={testId} className="mx-auto max-w-2xl px-6 py-16 text-[15px] leading-relaxed text-muted-foreground">
      <Link to="/" className="font-display text-sm font-black tracking-[-0.02em] text-foreground">
        Co-Create
      </Link>

      <h1 className="mt-8 font-display text-4xl font-black tracking-[-0.02em] text-foreground">{title}</h1>
      <p className="mt-2 text-sm">Last updated {updated}</p>

      {children}

      <p className="mt-16 flex gap-6 border-t border-border pt-6 text-sm">
        <Link to="/" className="underline underline-offset-4 hover:text-foreground">
          Back to Co-Create
        </Link>
        <Link to="/terms" className="underline underline-offset-4 hover:text-foreground">
          Terms of Service
        </Link>
        <Link to="/privacy" className="underline underline-offset-4 hover:text-foreground">
          Privacy Policy
        </Link>
      </p>
    </main>
  )
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="mb-3 mt-10 font-display text-xl font-bold tracking-[-0.01em] text-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function Email() {
  return (
    <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="text-foreground underline underline-offset-4">
      {PRIVACY_CONTACT_EMAIL}
    </a>
  )
}

/** Bold lead-in for a paragraph or list item. */
export function B({ children }: { children: ReactNode }) {
  return <strong className="text-foreground">{children}</strong>
}
