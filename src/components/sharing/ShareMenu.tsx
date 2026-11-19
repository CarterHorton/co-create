/**
 * Share — send this board to people in your party, or revoke them. Only the
 * owner can change access; everyone on the board can see who's on it.
 */

import { useState } from 'react'
import { useQuery } from 'deepspace'
import { Share2, X } from 'lucide-react'
import { Button, Popover, PopoverContent, PopoverTrigger, useToast } from '@/components/ui'
import { callAction } from '@/lib/actions'
import type { Friendship, TeamMember } from './types'
import { ShareLinks } from './ShareLinks'

export function ShareMenu({ boardId, userId, isOwner }: { boardId: string; userId: string; isOwner: boolean }) {
  const { error } = useToast()
  const { records: members } = useQuery<TeamMember>('team_members', { where: { teamId: boardId } })
  const { records: friends } = useQuery<Friendship>('friendships', { where: { ownerId: userId } })
  const [busy, setBusy] = useState<string | null>(null)

  const memberIds = new Set(members.map((m) => m.data.userId))
  const others = members.filter((m) => m.data.userId !== userId && m.data.role !== 'owner')
  const sendable = friends.filter((f) => !memberIds.has(f.data.friendId))

  async function run(key: string, name: string, params: Record<string, unknown>) {
    setBusy(key)
    try {
      await callAction(name, { boardId, ...params })
    } catch (e) {
      error(name === 'boardShare' ? 'Could not send board' : 'Could not revoke', (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button data-testid="share-open" variant="outline" size="sm" className="ml-auto gap-1.5">
            <Share2 className="size-3.5" />
            Share{others.length > 0 && ` · ${others.length}`}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 p-4" data-testid="share-menu">
        <h3 className="mb-2 text-sm font-bold">People on this board</h3>
        {others.length === 0 ? (
          <p className="mb-4 text-xs text-muted-foreground">Private — only {isOwner ? 'you' : 'the owner'} so far.</p>
        ) : (
          <ul className="mb-4 space-y-1">
            {others.map((m) => (
              <li key={m.recordId} className="flex items-center justify-between gap-2 text-sm" data-testid={`share-member-${m.data.userId}`}>
                <span className="truncate">
                  {m.data.userId === userId ? 'You' : m.data.name || 'Someone'}
                  {m.data.role === 'viewer' && <span className="text-xs text-muted-foreground"> · view only</span>}
                </span>
                {isOwner && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Revoke ${m.data.name || 'access'}`}
                    data-testid={`share-revoke-${m.data.userId}`}
                    loading={busy === `r:${m.data.userId}`}
                    onClick={() => run(`r:${m.data.userId}`, 'boardRevoke', { userId: m.data.userId })}
                  >
                    <X className="size-3.5" /> Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isOwner && (
          <>
            <h3 className="mb-2 text-sm font-bold">Send to your party</h3>
            {sendable.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {friends.length === 0
                  ? 'No friends yet — add them with a friend code on the Boards page.'
                  : 'Everyone in your party already has it.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {sendable.map((f) => (
                  <li key={f.recordId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{f.data.friendName || 'Friend'}</span>
                    <Button
                      size="sm"
                      data-testid={`share-send-${f.data.friendId}`}
                      loading={busy === `s:${f.data.friendId}`}
                      onClick={() => run(`s:${f.data.friendId}`, 'boardShare', { friendId: f.data.friendId })}
                    >
                      Send
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {isOwner && <ShareLinks boardId={boardId} />}
      </PopoverContent>
    </Popover>
  )
}
