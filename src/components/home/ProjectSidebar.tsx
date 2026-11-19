/**
 * The views on /home: All boards, each of your projects, Archived. Creates
 * projects, and each project has a menu to rename, share or delete it.
 * Boards you own can be dropped on a project to move them (the card menu
 * does the same from the keyboard).
 */

import { useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { Archive, Folder, LayoutGrid, MoreHorizontal, Pencil, Plus, Trash2, Users } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  cn,
} from '@/components/ui'
import { MAX_PROJECT_NAME_LENGTH } from '@/schemas/projects-schema'
import type { HomeView } from './boardList'

export const BOARD_DRAG_TYPE = 'application/x-cocreate-board'

export interface SidebarProject {
  id: string
  name: string
  count: number
  sharedWith: number
}

const sameView = (a: HomeView, b: HomeView) =>
  a.kind === b.kind && (a.kind !== 'project' || (b.kind === 'project' && a.projectId === b.projectId))

function ViewButton({
  active,
  onClick,
  children,
  testId,
  onDrop,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  testId: string
  onDrop?: (boardId: string) => void
}) {
  const [over, setOver] = useState(false)
  const dropProps = onDrop
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes(BOARD_DRAG_TYPE)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setOver(true)
        },
        onDragLeave: () => setOver(false),
        onDrop: (e: DragEvent) => {
          setOver(false)
          const id = e.dataTransfer.getData(BOARD_DRAG_TYPE)
          if (id) {
            e.preventDefault()
            onDrop(id)
          }
        },
      }
    : {}
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      data-testid={testId}
      {...dropProps}
      className={cn(
        'flex w-full min-w-0 items-center gap-2 border-l-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        active ? 'border-foreground font-bold' : 'border-transparent text-muted-foreground',
        over && 'bg-royal/20',
      )}
    >
      {children}
    </button>
  )
}

export function ProjectSidebar({
  view,
  onView,
  projects,
  canCreate,
  onCreate,
  onRename,
  onShare,
  onDelete,
  onDropBoard,
}: {
  view: HomeView
  onView: (v: HomeView) => void
  projects: SidebarProject[]
  canCreate: boolean
  onCreate: (name: string) => Promise<boolean>
  onRename: (p: SidebarProject) => void
  onShare: (p: SidebarProject) => void
  onDelete: (p: SidebarProject) => void
  onDropBoard: (boardId: string, projectId: string) => void
}) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setCreating(true)
    if (await onCreate(name)) setName('')
    setCreating(false)
  }

  return (
    <nav aria-label="Board folders" data-testid="project-sidebar" className="mb-6 md:mb-0">
      <ul className="space-y-0.5">
        <li>
          <ViewButton active={view.kind === 'all'} onClick={() => onView({ kind: 'all' })} testId="view-all">
            <LayoutGrid className="size-4 shrink-0" aria-hidden />
            All boards
          </ViewButton>
        </li>
      </ul>

      <h2 className="mb-1 mt-5 px-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">Projects</h2>
      {projects.length === 0 ? (
        <p className="px-3 py-1 text-xs text-muted-foreground">No projects yet.</p>
      ) : (
        <ul className="space-y-0.5" data-testid="project-list">
          {projects.map((p) => {
            const v: HomeView = { kind: 'project', projectId: p.id }
            return (
              <li key={p.id} className="group flex items-center" data-testid={`project-${p.id}`}>
                <ViewButton
                  active={sameView(view, v)}
                  onClick={() => onView(v)}
                  testId={`view-project-${p.id}`}
                  onDrop={(boardId) => onDropBoard(boardId, p.id)}
                >
                  <Folder className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.sharedWith > 0 && (
                    <span className="flex items-center gap-0.5 font-mono text-xs text-muted-foreground">
                      <Users className="size-3" aria-hidden />
                      <span className="sr-only">shared with</span>
                      {p.sharedWith}
                    </span>
                  )}
                  <span className="font-mono text-xs text-muted-foreground">
                    <span className="sr-only">, </span>
                    {p.count}
                    <span className="sr-only"> {p.count === 1 ? 'board' : 'boards'}</span>
                  </span>
                </ViewButton>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label={`Project options for ${p.name}`}
                        data-testid={`project-menu-${p.id}`}
                        className="p-2 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <MoreHorizontal className="size-4" aria-hidden />
                      </button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => onRename(p)} data-testid="project-menu-rename">
                      <Pencil aria-hidden /> Rename…
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onShare(p)} data-testid="project-menu-share">
                      <Users aria-hidden /> Share…
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => onDelete(p)} data-testid="project-menu-delete">
                      <Trash2 aria-hidden /> Delete…
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            )
          })}
        </ul>
      )}

      {canCreate && (
        <form onSubmit={submit} className="mt-2 flex gap-1 px-1">
          <Input
            aria-label="New project name"
            data-testid="project-name-input"
            value={name}
            maxLength={MAX_PROJECT_NAME_LENGTH}
            onChange={(e) => setName(e.target.value)}
            placeholder="New project"
            className="h-8 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            aria-label="Create project"
            data-testid="project-create"
            loading={creating}
            disabled={!name.trim()}
          >
            <Plus className="size-3.5" aria-hidden />
          </Button>
        </form>
      )}

      <ul className="mt-5 space-y-0.5">
        <li>
          <ViewButton active={view.kind === 'archived'} onClick={() => onView({ kind: 'archived' })} testId="view-archived">
            <Archive className="size-4 shrink-0" aria-hidden />
            Archived
          </ViewButton>
        </li>
      </ul>
    </nav>
  )
}
