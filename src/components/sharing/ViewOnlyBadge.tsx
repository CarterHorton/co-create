/**
 * "View only" next to the board title for people who joined through a
 * view-only link (their access row has role 'viewer'). Text, not colour, so
 * it reads the same everywhere; the canvas and toolbar are read-only too.
 */

import { useQuery } from 'deepspace'
import { Eye } from 'lucide-react'
import { Badge } from '@/components/ui'
import type { TeamMember } from './types'

export function useIsBoardViewer(boardId: string, userId: string): boolean {
  const { records } = useQuery<TeamMember>('team_members', { where: { teamId: boardId, userId } })
  return records.some((r) => r.data.role === 'viewer')
}

export function ViewOnlyBadge({ boardId, userId }: { boardId: string; userId: string }) {
  if (!useIsBoardViewer(boardId, userId)) return null
  return (
    <Badge variant="outline" data-testid="view-only-badge" className="shrink-0 gap-1 rounded-none">
      <Eye aria-hidden="true" className="size-3" />
      View only
    </Badge>
  )
}
