/**
 * Follow mode UI (state lives in useFollow):
 *   - PresenceAvatars — collaborators' avatars as buttons; clicking one follows them.
 *   - FollowBanner    — "Following Alex — Stop", and a collaborator's
 *                       "follow me" request with Follow / Not now.
 */

import { getUserColor } from 'deepspace'
import { Eye, Megaphone } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { BoardPresence } from './types'
import type { FollowState } from './useFollow'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'

export function PresenceAvatars({ peers, f }: { peers: BoardPresence['peers']; f: FollowState }) {
  if (!f.enabled) {
    // Without follow mode, plain avatars as before.
    return (
      <div className="flex -space-x-1">
        {peers.map((p) => (
          <span
            key={p.userId}
            title={p.userName}
            className="flex size-7 items-center justify-center border border-foreground text-xs font-bold text-white"
            style={{ background: getUserColor(p.userId) }}
          >
            {(p.userName?.[0] ?? '?').toUpperCase()}
          </span>
        ))}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <div role="group" aria-label="Collaborators" className="flex -space-x-1">
        {peers.map((p) => {
          const name = p.userName || 'Someone'
          const on = f.following?.userId === p.userId
          return (
            <button
              key={p.userId}
              type="button"
              data-testid="follow-avatar"
              data-user-id={p.userId}
              title={on ? `Following ${name}. Click to stop.` : `Follow ${name}`}
              aria-label={`Follow ${name}`}
              aria-pressed={on}
              onClick={() => (on ? f.stop() : f.follow(p.userId))}
              className={cn(
                'relative flex size-7 items-center justify-center border border-foreground text-xs font-bold text-white',
                on && 'z-10 outline-2 outline-offset-1 outline-foreground',
                FOCUS,
              )}
              style={{ background: getUserColor(p.userId) }}
            >
              {(name[0] ?? '?').toUpperCase()}
              {on && (
                <Eye aria-hidden className="absolute -bottom-1.5 -right-1.5 size-3.5 border border-foreground bg-background p-px text-foreground" />
              )}
            </button>
          )
        })}
      </div>
      {peers.length > 0 && (
        <button
          type="button"
          data-testid="spotlight-toggle"
          aria-pressed={f.spotlight}
          title={f.spotlight ? 'Stop asking everyone to follow you' : 'Ask everyone to follow you'}
          aria-label="Ask everyone to follow me"
          onClick={() => f.setSpotlight(!f.spotlight)}
          className={cn(
            'flex size-7 items-center justify-center border border-foreground shadow-[2px_2px_0_0_#000]',
            f.spotlight ? 'bg-foreground text-background' : 'bg-background hover:bg-royal/20',
            FOCUS,
          )}
        >
          <Megaphone aria-hidden className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export function FollowBanner({ f }: { f: FollowState }) {
  if (!f.enabled) return null
  const req = f.spotlightRequest
  if (!f.following && !req) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[116px] z-30 flex flex-col items-center gap-2 min-[1600px]:top-[68px]">
      {f.following && (
        <div
          data-testid="follow-banner"
          className="pointer-events-auto flex items-center gap-3 border border-foreground bg-foreground py-1 pl-3 pr-1 text-sm text-background shadow-[2px_2px_0_0_#000]"
        >
          <Eye aria-hidden className="size-4" />
          <span>
            Following <strong>{f.following.userName}</strong>
          </span>
          <Button
            size="sm"
            variant="outline"
            data-testid="follow-stop"
            onClick={f.stop}
            aria-label={`Stop following ${f.following.userName}`}
            className="h-7 rounded-none border-background bg-foreground text-background hover:bg-background hover:text-foreground"
          >
            Stop
          </Button>
        </div>
      )}
      {req && (
        <div
          data-testid="spotlight-request"
          role="group"
          aria-label={`${req.userName} asks everyone to follow them`}
          className="pointer-events-auto flex items-center gap-3 border border-foreground bg-background py-1 pl-3 pr-1 text-sm shadow-[2px_2px_0_0_#000]"
        >
          <Megaphone aria-hidden className="size-4" />
          <span>
            <strong>{req.userName}</strong> asks everyone to follow them
          </span>
          <Button size="sm" className="h-7 rounded-none" data-testid="spotlight-accept" onClick={() => f.follow(req.userId)}>
            Follow
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-none"
            data-testid="spotlight-dismiss"
            onClick={() => f.dismissSpotlight(req.userId)}
          >
            Not now
          </Button>
        </div>
      )}
    </div>
  )
}
