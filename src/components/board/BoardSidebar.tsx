/**
 * Right-hand sidebar with tabs (Call, History, …). Every pane stays mounted
 * while hidden, so switching tabs never drops the call.
 *
 * A pane marked `closable` (History) has a × on its tab. It starts open;
 * closing it only hides it, and a button with its icon reopens it. When every
 * pane is closed the sidebar shrinks to a thin rail of those buttons, giving
 * the board the room.
 */

import { useState, type ReactNode } from 'react'
import { X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SidebarPane {
  id: string
  label: string
  badge?: ReactNode
  content: ReactNode
  /** Can be closed (and reopened) by the user. Starts open. */
  closable?: boolean
  /** Shown on the reopen button once closed. */
  Icon?: LucideIcon
}

export function BoardSidebar({
  panes,
  initial,
  select,
}: {
  panes: SidebarPane[]
  initial?: string
  /** Show (and reopen) this pane; a new object each time it should happen again. */
  select?: { id: string } | null
}) {
  const [active, setActive] = useState(initial ?? panes[0]?.id)
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const [seenSelect, setSeenSelect] = useState(select)
  if (select !== seenSelect) {
    setSeenSelect(select)
    if (select) {
      setActive(select.id)
      if (closed.has(select.id)) setClosed((prev) => new Set([...prev].filter((id) => id !== select.id)))
    }
  }
  const open = panes.filter((p) => !closed.has(p.id))
  const shut = panes.filter((p) => closed.has(p.id))
  // If the active pane was closed, fall back to the first one still open.
  const shown = open.some((p) => p.id === active) ? active : open[0]?.id
  const rail = open.length === 0

  const close = (id: string) => setClosed((prev) => new Set(prev).add(id))
  const reopen = (id: string) => {
    setClosed((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setActive(id)
  }

  const reopenButtons = shut.map((p) => {
    const Icon = p.Icon
    return (
      <button
        key={p.id}
        type="button"
        data-testid={`sidebar-open-${p.id}`}
        aria-label={`Show ${p.label.toLowerCase()}`}
        title={`Show ${p.label.toLowerCase()}`}
        onClick={() => reopen(p.id)}
        className={cn(
          'flex items-center justify-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-[0.05em] hover:bg-royal/20',
          rail ? 'h-auto w-10 flex-col border-b border-border py-3 [writing-mode:vertical-rl]' : 'shrink-0 border-l border-border px-2.5',
        )}
      >
        {Icon && <Icon className={cn('size-3.5', rail && 'rotate-90')} />}
        {rail || !Icon ? p.label : null}
        {p.badge}
      </button>
    )
  })

  return (
    <aside
      data-testid="board-sidebar"
      data-collapsed={rail || undefined}
      className={cn('flex shrink-0 flex-col border-l border-border bg-background', rail ? 'w-10' : 'w-72')}
    >
      {rail ? (
        reopenButtons
      ) : (
        <div role="tablist" aria-label="Board panels" className="flex h-10 shrink-0 border-b border-border">
          {open.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex min-w-0 flex-1 items-stretch border-r border-border last:border-r-0',
                shown === p.id ? 'bg-foreground text-background' : 'hover:bg-royal/20',
              )}
            >
              <button
                type="button"
                role="tab"
                id={`tab-${p.id}`}
                data-testid={`sidebar-tab-${p.id}`}
                aria-selected={shown === p.id}
                aria-controls={`pane-${p.id}`}
                onClick={() => setActive(p.id)}
                className="flex flex-1 items-center justify-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-[0.05em]"
              >
                {p.label}
                {p.badge}
              </button>
              {p.closable && (
                <button
                  type="button"
                  data-testid={`sidebar-close-${p.id}`}
                  aria-label={`Close ${p.label.toLowerCase()}`}
                  title={`Close ${p.label.toLowerCase()}`}
                  onClick={() => close(p.id)}
                  className="flex w-8 shrink-0 items-center justify-center opacity-70 hover:opacity-100"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          {reopenButtons}
        </div>
      )}
      {panes.map((p) => (
        <div
          key={p.id}
          id={`pane-${p.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${p.id}`}
          hidden={rail || shown !== p.id}
          className="min-h-0 flex-1 flex-col [&:not([hidden])]:flex"
        >
          {p.content}
        </div>
      ))}
    </aside>
  )
}
