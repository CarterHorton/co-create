/**
 * Right-hand sidebar with tabs (Call, History, …). Every pane stays mounted
 * while hidden, so switching tabs never drops the call.
 */

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SidebarPane {
  id: string
  label: string
  badge?: ReactNode
  content: ReactNode
}

export function BoardSidebar({ panes, initial }: { panes: SidebarPane[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? panes[0]?.id)
  return (
    <aside data-testid="board-sidebar" className="flex w-72 shrink-0 flex-col border-l border-border bg-background">
      <div role="tablist" aria-label="Board panels" className="flex h-10 shrink-0 border-b border-border">
        {panes.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`tab-${p.id}`}
            data-testid={`sidebar-tab-${p.id}`}
            aria-selected={active === p.id}
            aria-controls={`pane-${p.id}`}
            onClick={() => setActive(p.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 border-r border-border font-mono text-xs font-semibold uppercase tracking-[0.05em] last:border-r-0',
              active === p.id ? 'bg-foreground text-background' : 'hover:bg-royal/20',
            )}
          >
            {p.label}
            {p.badge}
          </button>
        ))}
      </div>
      {panes.map((p) => (
        <div
          key={p.id}
          id={`pane-${p.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${p.id}`}
          hidden={active !== p.id}
          className="min-h-0 flex-1 flex-col [&:not([hidden])]:flex"
        >
          {p.content}
        </div>
      ))}
    </aside>
  )
}
