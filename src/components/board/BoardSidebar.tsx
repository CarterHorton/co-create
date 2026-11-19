/**
 * Right-hand sidebar (Call, History, Votes, Comments, …). Every pane stays
 * mounted while hidden, so switching panes never drops the call.
 *
 * A hamburger menu picks the pane; the header shows its name. "Hide panel"
 * folds the sidebar to a thin rail, giving the board the room; the rail's
 * menu (or its expand button) brings it back.
 */

import { useState, type ReactNode } from 'react'
import { Menu, PanelRightClose, PanelRightOpen, type LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui'
import { cn } from '@/lib/utils'

export interface SidebarPane {
  id: string
  label: string
  badge?: ReactNode
  content: ReactNode
  /** Shown next to the pane's name in the menu. */
  Icon?: LucideIcon
}

const iconButton =
  'flex size-10 shrink-0 items-center justify-center hover:bg-royal/20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring'

export function BoardSidebar({
  panes,
  initial,
  select,
}: {
  panes: SidebarPane[]
  initial?: string
  /** Show (and expand to) this pane; a new object each time it should happen again. */
  select?: { id: string } | null
}) {
  const [active, setActive] = useState(initial ?? panes[0]?.id)
  const [collapsed, setCollapsed] = useState(false)
  const [seenSelect, setSeenSelect] = useState(select)
  if (select !== seenSelect) {
    setSeenSelect(select)
    if (select) {
      setActive(select.id)
      setCollapsed(false)
    }
  }
  // A pane can disappear (e.g. it's only offered to some people): fall back to the first.
  const current = panes.find((p) => p.id === active) ?? panes[0]
  const show = (id: string) => {
    setActive(id)
    setCollapsed(false)
  }

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            data-testid="sidebar-menu"
            aria-label={`Board panels: ${current?.label ?? ''}`}
            title="Board panels"
            className={iconButton}
          >
            <Menu className="size-4" aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent align={collapsed ? 'end' : 'start'} className="w-56">
        <DropdownMenuRadioGroup value={current?.id}>
          {panes.map((p) => {
            const Icon = p.Icon
            return (
              <DropdownMenuRadioItem
                key={p.id}
                value={p.id}
                // Radio items keep the menu open by default; picking a panel should close it.
                closeOnClick
                onClick={() => show(p.id)}
                data-testid={`sidebar-tab-${p.id}`}
                className="gap-2"
              >
                {Icon && <Icon className="size-3.5" aria-hidden />}
                <span className="flex-1">{p.label}</span>
                {p.badge}
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <aside
      data-testid="board-sidebar"
      data-collapsed={collapsed || undefined}
      aria-label="Board panels"
      className={cn('flex shrink-0 flex-col border-l border-border bg-background', collapsed ? 'w-10' : 'w-72')}
    >
      {collapsed ? (
        <div className="flex flex-col items-center border-b border-border">
          {menu}
          <button
            type="button"
            data-testid="sidebar-expand"
            aria-label={`Show ${current?.label.toLowerCase() ?? 'panel'}`}
            title={`Show ${current?.label.toLowerCase() ?? 'panel'}`}
            onClick={() => setCollapsed(false)}
            className={iconButton}
          >
            <PanelRightOpen className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <div className="flex h-10 shrink-0 items-center border-b border-border">
          {menu}
          <h2
            data-testid="sidebar-title"
            className="flex min-w-0 flex-1 items-center gap-1.5 truncate px-1 font-mono text-xs font-semibold uppercase tracking-[0.05em]"
          >
            {current?.label}
            {current?.badge}
          </h2>
          <button
            type="button"
            data-testid="sidebar-collapse"
            aria-label="Hide panel"
            title="Hide panel"
            onClick={() => setCollapsed(true)}
            className={iconButton}
          >
            <PanelRightClose className="size-4" aria-hidden />
          </button>
        </div>
      )}
      {panes.map((p) => (
        <section
          key={p.id}
          id={`pane-${p.id}`}
          data-testid={`sidebar-pane-${p.id}`}
          aria-label={p.label}
          hidden={collapsed || current?.id !== p.id}
          className="min-h-0 flex-1 flex-col [&:not([hidden])]:flex"
        >
          {p.content}
        </section>
      ))}
    </aside>
  )
}
