/**
 * The @-mention inbox in the top navigation: a bell with the number of
 * unread mentions, and a menu of recent ones. Picking one opens its board at
 * the thread (/board/:id?thread=…) and marks it read.
 */

import { useNavigate } from 'react-router-dom'
import { useQuery } from 'deepspace'
import { AtSign, Bell } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui'
import { callAction } from '@/lib/actions'
import { cn } from '@/lib/utils'

interface MentionRow {
  userId: string
  boardId: string
  boardTitle?: string
  commentId: string
  threadId: string
  actorName?: string
  excerpt?: string
  read?: boolean | number
}

const SHOWN = 20

export function MentionsMenu() {
  const navigate = useNavigate()
  // Read is 'own' on userId, so this is only the caller's mentions.
  const { records } = useQuery<MentionRow>('mentions', { orderBy: 'createdAt', orderDir: 'desc', limit: 100 })
  const unread = records.filter((r) => !r.data.read)
  const shown = records.slice(0, SHOWN)
  const label = unread.length ? `Mentions, ${unread.length} unread` : 'Mentions'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            data-testid="mentions-button"
            aria-label={label}
            title={label}
            className="relative flex h-8 items-center gap-1 border border-border px-2 text-sm hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Bell className="size-4" aria-hidden />
            {unread.length > 0 && (
              <span
                data-testid="mentions-unread"
                aria-hidden
                className="min-w-4 bg-foreground px-1 font-mono text-[10px] font-bold leading-4 text-background"
              >
                {unread.length > 99 ? '99+' : unread.length}
              </span>
            )}
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Mentions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {shown.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">Nobody has mentioned you yet.</p>
        ) : (
          shown.map((m) => {
            const isUnread = !m.data.read
            return (
              <DropdownMenuItem
                key={m.recordId}
                data-testid="mention-item"
                data-unread={isUnread || undefined}
                onClick={() => {
                  if (isUnread) void callAction('mentionsMarkRead', { ids: [m.recordId] }).catch(() => undefined)
                  navigate(`/board/${encodeURIComponent(m.data.boardId)}?thread=${encodeURIComponent(m.data.threadId)}`)
                }}
                className="flex items-start gap-2 whitespace-normal py-2"
              >
                <AtSign className={cn('mt-0.5 size-3.5 shrink-0', !isUnread && 'opacity-40')} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm', isUnread ? 'font-bold' : 'text-muted-foreground')}>
                    {isUnread && <span className="mr-1 font-mono text-[10px] uppercase">New ·</span>}
                    {m.data.actorName || 'Someone'} mentioned you on {m.data.boardTitle || 'a board'}
                  </span>
                  {m.data.excerpt && <span className="block truncate text-xs text-muted-foreground">{m.data.excerpt}</span>}
                </span>
              </DropdownMenuItem>
            )
          })
        )}
        {unread.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="mentions-mark-all"
              onClick={() => void callAction('mentionsMarkRead', { all: true }).catch(() => undefined)}
            >
              Mark all as read
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
