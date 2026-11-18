/**
 * Which boards /home shows, and in what order: the view (all / one project /
 * archived), the title search, the sort, and pins first. No React here, so
 * it is unit-tested directly.
 */

export type HomeView = { kind: 'all' } | { kind: 'archived' } | { kind: 'project'; projectId: string }
export type SortKey = 'recent' | 'name' | 'owner'

export const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Recently updated',
  name: 'Name',
  owner: 'Owner',
}

export interface ListBoard {
  id: string
  title: string
  ownerId: string
  /** '' / undefined = not in a project. */
  projectId?: string
  archived?: boolean | number
  createdAt: string
  updatedAt?: string
  /** Display name of the owner ("You" for your own boards). */
  ownerName: string
}

export interface ListOptions {
  view: HomeView
  query: string
  sort: SortKey
  pinned: ReadonlySet<string>
  userId: string
}

export const isArchived = (b: Pick<ListBoard, 'archived'>) => b.archived === true || b.archived === 1

function inView(b: ListBoard, view: HomeView): boolean {
  if (view.kind === 'archived') return isArchived(b)
  if (isArchived(b)) return false
  if (view.kind === 'project') return (b.projectId || '') === view.projectId
  return true
}

/** Lower-case and strip accents, so "café" matches "cafe". */
export function normalize(text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

const time = (b: ListBoard) => Date.parse(b.updatedAt || b.createdAt) || 0
const byTitle = (a: ListBoard, b: ListBoard) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })

export function compareBoards(sort: SortKey, userId: string) {
  return (a: ListBoard, b: ListBoard): number => {
    if (sort === 'name') return byTitle(a, b) || time(b) - time(a)
    if (sort === 'owner') {
      const mineA = a.ownerId === userId
      const mineB = b.ownerId === userId
      if (mineA !== mineB) return mineA ? -1 : 1
      return a.ownerName.localeCompare(b.ownerName, undefined, { sensitivity: 'base' }) || byTitle(a, b)
    }
    return time(b) - time(a) || byTitle(a, b)
  }
}

export function visibleBoards(boards: readonly ListBoard[], opts: ListOptions): ListBoard[] {
  const q = normalize(opts.query)
  const cmp = compareBoards(opts.sort, opts.userId)
  return boards
    .filter((b) => inView(b, opts.view) && (!q || normalize(b.title).includes(q)))
    .sort((a, b) => {
      const pa = opts.pinned.has(a.id)
      const pb = opts.pinned.has(b.id)
      if (pa !== pb) return pa ? -1 : 1
      return cmp(a, b)
    })
}

/** How many active (non-archived) boards each project holds, for the sidebar. */
export function projectCounts(boards: readonly ListBoard[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const b of boards) {
    if (isArchived(b) || !b.projectId) continue
    counts.set(b.projectId, (counts.get(b.projectId) ?? 0) + 1)
  }
  return counts
}
