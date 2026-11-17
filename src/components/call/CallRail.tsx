/**
 * CallRail — the call panel beside the whiteboard. Audio-first: everyone
 * shows as a compact tile, which grows to show video when their camera is on.
 */

import { useEffect, useRef } from 'react'
import { getUserColor } from 'deepspace'
import { Mic, MicOff, PhoneOff, Phone, Video, VideoOff, Volume2 } from 'lucide-react'
import type { VideoTrack } from 'livekit-client'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useCall, type CallParticipant } from './useCall'

export function CallRail({ boardId, displayName }: { boardId: string; displayName?: string }) {
  const call = useCall(boardId, displayName)
  const inCall = call.status === 'connected'

  return (
    <section data-testid="call-rail" aria-label="Call" className="flex min-h-0 flex-1 flex-col bg-background">
      {inCall && (
        <div className="flex h-8 items-center border-b border-border px-4">
          <span data-testid="call-count" className="font-mono text-xs text-muted-foreground">
            {call.participants.length} in call
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {inCall ? (
          <ul className="flex flex-col gap-2">
            {call.participants.map((p) => (
              <ParticipantTile key={p.identity} p={p} />
            ))}
          </ul>
        ) : (
          <p className="p-1 text-sm text-muted-foreground">
            Talk it through while you draw. Everyone on this board can join.
          </p>
        )}
        {call.error && (
          <p role="alert" className="mt-3 border border-destructive/40 p-2 text-xs text-destructive">
            {call.error}
          </p>
        )}
        {call.audioBlocked && (
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={call.startAudio}>
            <Volume2 /> Enable audio
          </Button>
        )}
      </div>

      <div className="border-t border-border p-3">
        {inCall ? (
          <div className="flex gap-2">
            <RailButton
              testId="call-mic"
              label={call.micOn ? 'Mute' : 'Unmute'}
              active={!call.micOn}
              onClick={call.toggleMic}
            >
              {call.micOn ? <Mic /> : <MicOff />}
            </RailButton>
            <RailButton
              testId="call-camera"
              label={call.cameraOn ? 'Turn camera off' : 'Turn camera on'}
              active={call.cameraOn}
              onClick={call.toggleCamera}
            >
              {call.cameraOn ? <Video /> : <VideoOff />}
            </RailButton>
            <Button data-testid="call-leave" className="flex-1" onClick={call.leave}>
              <PhoneOff /> Leave
            </Button>
          </div>
        ) : (
          <Button
            data-testid="call-join"
            className="w-full"
            loading={call.status === 'joining'}
            onClick={() => void call.join()}
          >
            <Phone /> Join call
          </Button>
        )}
      </div>
    </section>
  )
}

function RailButton({
  testId,
  label,
  active,
  onClick,
  children,
}: {
  testId: string
  label: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex size-10 items-center justify-center border border-foreground transition-colors [&_svg]:size-4',
        active ? 'bg-foreground text-background' : 'hover:bg-royal/20',
      )}
    >
      {children}
    </button>
  )
}

function ParticipantTile({ p }: { p: CallParticipant }) {
  const color = getUserColor(p.identity)
  return (
    <li
      data-testid="call-participant"
      className={cn(
        'border border-border transition-[outline-color]',
        p.speaking ? 'outline outline-2 outline-royal/50' : 'outline outline-2 outline-transparent',
      )}
    >
      {p.video && <VideoView track={p.video} mirror={p.isLocal} />}
      <div className="flex items-center gap-2 p-2">
        <span
          className="flex size-7 shrink-0 items-center justify-center text-xs font-bold text-white"
          style={{ background: color }}
        >
          {(p.name[0] ?? '?').toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {p.name}
          {p.isLocal && <span className="text-muted-foreground"> (you)</span>}
        </span>
        {p.micOn ? (
          <Mic className={cn('size-3.5', p.speaking ? 'text-foreground' : 'text-muted-foreground')} aria-label="Mic on" />
        ) : (
          <MicOff className="size-3.5 text-muted-foreground" aria-label="Muted" />
        )}
      </div>
    </li>
  )
}

function VideoView({ track, mirror }: { track: VideoTrack; mirror: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    track.attach(el)
    return () => {
      track.detach(el)
    }
  }, [track])
  return (
    <video
      ref={ref}
      muted
      playsInline
      className={cn('aspect-video w-full bg-black object-cover', mirror && '-scale-x-100')}
    />
  )
}
