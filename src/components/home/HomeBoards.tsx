/**
 * The board browser on /home: project sidebar, search + sort, and the board
 * cards with their menus. Owns everything about projects, pins and archiving;
 * home.tsx keeps creating boards and the permanent-delete confirmation.
 */

import { useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutations, useQuery, type RecordData } from 'deepspace'
import { Archive, ArrowRight, Pin } from 'lucide-react'
import { ConfirmModal, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import type { TeamMember } from '@/components/sharing/types'
import { BoardCardMenu } from './BoardCardMenu'
import { BoardsToolbar } from './BoardsToolbar'
import { RenameProjectModal, ShareProjectModal, type ProjectMember } from './ProjectDialogs'
import { BOARD_DRAG_TYPE, ProjectSidebar, type SidebarProject } from './ProjectSidebar'
import { isArchived, projectCounts, visibleBoards, type HomeView, type ListBoard, type SortKey } from './boardList'

export interface HomeBoard {
  title: string
  ownerId: string
  projectId?: string
  archived?: boolean | number
}

interface Project {
  name: string
  ownerId: string
}

interface BoardPin {
  ownerId: string
  boardId: string
}

export function HomeBoards({
  boards,
  status,
  userId,
  canCreate,
  onDelete,
}: {
  boards: RecordData<HomeBoard>[]
  status: 'loading' | 'ready' | 'error'
  userId: string
  canCreate: boolean
  /** Open home's permanent-delete confirmation for this board. */
  onDelete: (board: { id: string; title: string }) => void
}) {
  const { error, success } = useToast()
  const { records: projectRows } = useQuery<Project>('projects', { where: { ownerId: userId } })
  const { records: pins } = useQuery<BoardPin>('board_pins', { where: { ownerId: userId } })
  const { records: memberships } = useQuery<TeamMember>('team_members')
  const { records: projectMembers } = useQuery<ProjectMember>('project_members', { where: { ownerId: userId } })
  const { create: createPin, remove: removePin } = useMutations<BoardPin>('board_pins')

  const [view, setView] = useState<HomeView>({ kind: 'all' })
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')

  const [renaming, setRenaming] = useState<SidebarProject | null>(null)
  const [sharing, setSharing] = useState<SidebarProject | null>(null)
  const [deleting, setDeleting] = useState<SidebarProject | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const list: ListBoard[] = useMemo(() => {
    const owners = new Map<string, string>()
    for (const m of memberships) if (m.data.role === 'owner') owners.set(m.data.teamId, m.data.name || 'Someone')
    return boards.map((b) => ({
      id: b.recordId,
      title: b.data.title,
      ownerId: b.data.ownerId,
      projectId: b.data.projectId,
      archived: b.data.archived,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      ownerName: b.data.ownerId === userId ? 'You' : owners.get(b.recordId) || 'Someone',
    }))
  }, [boards, memberships, userId])

  const pinIds = useMemo(() => new Map(pins.map((p) => [p.data.boardId, p.recordId])), [pins])
  const pinned = useMemo(() => new Set(pinIds.keys()), [pinIds])

  const projects: SidebarProject[] = useMemo(() => {
    const counts = projectCounts(list.filter((b) => b.ownerId === userId))
    return projectRows
      .map((p) => ({
        id: p.recordId,
        name: p.data.name,
        count: counts.get(p.recordId) ?? 0,
        sharedWith: projectMembers.filter((m) => m.data.projectId === p.recordId).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [projectRows, projectMembers, list, userId])

  // A deleted project's view falls back to All boards.
  const activeView: HomeView =
    view.kind === 'project' && !projects.some((p) => p.id === view.projectId) ? { kind: 'all' } : view
  const shown = visibleBoards(list, { view: activeView, query, sort, pinned, userId })
  const viewName =
    activeView.kind === 'all'
      ? 'All boards'
      : activeView.kind === 'archived'
        ? 'Archived'
        : (projects.find((p) => p.id === activeView.projectId)?.name ?? '')

  async function act(name: string, params: Record<string, unknown>, failTitle: string): Promise<boolean> {
    try {
      await callAction(name, params)
      return true
    } catch (err) {
      error(failTitle, (err as Error).message)
      return false
    }
  }

  async function togglePin(boardId: string) {
    const pinId = pinIds.get(boardId)
    try {
      if (pinId) await removePin(pinId)
      else await createPin({ ownerId: userId, boardId })
    } catch (err) {
      error('Could not update pin', String(err))
    }
  }

  async function move(boardId: string, projectId: string) {
    if (await act('boardMove', { boardId, projectId }, 'Could not move board')) {
      const to = projects.find((p) => p.id === projectId)?.name
      success(to ? `Moved to ${to}` : 'Removed from project')
    }
  }

  async function archive(board: ListBoard, archived: boolean) {
    if (await act('boardArchive', { boardId: board.id, archived }, archived ? 'Could not archive' : 'Could not restore')) {
      success(archived ? `Archived "${board.title}"` : `Restored "${board.title}"`)
    }
  }

  async function deleteProject() {
    if (!deleting) return
    setDeleteBusy(true)
    await act('projectDelete', { projectId: deleting.id }, 'Could not delete project')
    setDeleteBusy(false)
    setDeleteOpen(false)
  }

  const emptyText =
    query.trim()
      ? `No boards match "${query.trim()}".`
      : activeView.kind === 'archived'
        ? 'Nothing archived.'
        : activeView.kind === 'project'
          ? 'No boards in this project yet. Move one here from a board’s menu.'
          : 'No boards yet. Name one above to start, or ask a friend to send you one.'

  return (
    <div className="md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
      <ProjectSidebar
        view={activeView}
        onView={setView}
        projects={projects}
        canCreate={canCreate}
        onCreate={(name) => act('projectCreate', { name }, 'Could not create project')}
        onRename={setRenaming}
        onShare={setSharing}
        onDelete={(p) => {
          setDeleting(p)
          setDeleteOpen(true)
        }}
        onDropBoard={(boardId, projectId) => void move(boardId, projectId)}
      />

      <section aria-labelledby="board-view-title" data-testid="board-browser">
        <h2 id="board-view-title" className="mb-3 truncate font-display text-xl font-black" data-testid="board-view-title">
          {viewName}
        </h2>
        <BoardsToolbar query={query} onQuery={setQuery} sort={sort} onSort={setSort} />
        <p role="status" className="sr-only" data-testid="board-count">
          {status === 'loading' ? '' : `${shown.length} ${shown.length === 1 ? 'board' : 'boards'}`}
        </p>

        {status === 'loading' ? (
          <p className="text-sm text-muted-foreground">Loading boards…</p>
        ) : shown.length === 0 ? (
          <div className="border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            {emptyText}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2" data-testid="board-list">
            {shown.map((b) => {
              const mine = b.ownerId === userId
              const isPinned = pinned.has(b.id)
              const archived = isArchived(b)
              return (
                <li key={b.id} className="group relative" data-testid={`board-item-${b.id}`}>
                  <Link
                    to={`/board/${b.id}`}
                    data-testid={`board-card-${b.id}`}
                    draggable={mine && !archived}
                    onDragStart={(e: DragEvent) => {
                      if (mine && !archived) e.dataTransfer.setData(BOARD_DRAG_TYPE, b.id)
                    }}
                    className="flex items-center justify-between gap-4 border border-border bg-background p-5 pr-14 transition-colors hover:border-royal/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <div className="min-w-0">
                      <h3 className="flex items-center gap-1.5 truncate font-bold">
                        {isPinned && (
                          <>
                            <Pin className="size-3.5 shrink-0" aria-hidden />
                            <span className="sr-only">Pinned: </span>
                          </>
                        )}
                        <span className="truncate">{b.title}</span>
                      </h3>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {new Date(b.createdAt).toLocaleDateString()}
                        {mine ? ' · yours' : ` · shared by ${b.ownerName}`}
                        {archived && (
                          <span className="ml-1 inline-flex items-center gap-1">
                            · <Archive className="size-3" aria-hidden /> archived
                          </span>
                        )}
                      </p>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
                  </Link>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <BoardCardMenu
                      board={b}
                      mine={mine}
                      pinned={isPinned}
                      projects={projects}
                      onTogglePin={() => void togglePin(b.id)}
                      onMove={(projectId) => void move(b.id, projectId)}
                      onArchive={(a) => void archive(b, a)}
                      onDelete={() => onDelete({ id: b.id, title: b.title })}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <RenameProjectModal
        key={renaming?.id ?? 'none'}
        project={renaming}
        open={!!renaming}
        onClose={() => setRenaming(null)}
      />
      <ShareProjectModal project={sharing} userId={userId} open={!!sharing} onClose={() => setSharing(null)} />
      <ConfirmModal
        open={deleteOpen}
        onClose={() => {
          if (!deleteBusy) setDeleteOpen(false)
        }}
        onConfirm={() => void deleteProject()}
        title={`Delete project "${deleting?.name ?? ''}"?`}
        description="Its boards are kept and become unassigned. Friends you shared the project with lose the access it gave them."
        confirmText="Delete project"
        loading={deleteBusy}
      />
    </div>
  )
}
