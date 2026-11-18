/**
 * The "…" menu on a board card: pin / unpin (anyone), and for the owner move
 * to a project, archive / restore, and — from the Archived view — delete
 * permanently. A Base UI menu, so it works with arrow keys, Enter and Escape.
 */

import { Archive, ArchiveRestore, MoreHorizontal, Pin, PinOff, Trash2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui'
import type { ListBoard } from './boardList'
import { isArchived } from './boardList'

export interface ProjectOption {
  id: string
  name: string
}

const NO_PROJECT = '__none__'

export function BoardCardMenu({
  board,
  mine,
  pinned,
  projects,
  onTogglePin,
  onMove,
  onArchive,
  onDelete,
}: {
  board: ListBoard
  mine: boolean
  pinned: boolean
  projects: ProjectOption[]
  onTogglePin: () => void
  onMove: (projectId: string) => void
  onArchive: (archived: boolean) => void
  onDelete: () => void
}) {
  const archived = isArchived(board)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`Options for ${board.title}`}
            data-testid={`board-menu-${board.id}`}
            className="p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onClick={onTogglePin} data-testid="board-menu-pin">
          {pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
          {pinned ? 'Unpin' : 'Pin to top'}
        </DropdownMenuItem>
        {mine && !archived && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Move to project</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              aria-label="Move to project"
              value={board.projectId || NO_PROJECT}
              onValueChange={(v: string) => onMove(v === NO_PROJECT ? '' : v)}
            >
              <DropdownMenuRadioItem value={NO_PROJECT} closeOnClick>
                No project
              </DropdownMenuRadioItem>
              {projects.map((p) => (
                <DropdownMenuRadioItem key={p.id} value={p.id} closeOnClick>
                  <span className="truncate">{p.name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
        {mine && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onArchive(!archived)} data-testid="board-menu-archive">
              {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
              {archived ? 'Restore' : 'Archive'}
            </DropdownMenuItem>
            {archived && (
              <DropdownMenuItem variant="destructive" onClick={onDelete} data-testid="board-menu-delete">
                <Trash2 aria-hidden />
                Delete permanently…
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
