/**
 * useCall — audio/video for one board, on LiveKit.
 *
 * DeepSpace mints the access token (`livekit/generate-token`, free, sign-in
 * required); livekit-client does the WebRTC. The LiveKit room auto-creates
 * when the first person joins and disposes itself when empty, so there is no
 * room lifecycle or billing to manage.
 *
 * Remote audio is attached to detached <audio> elements so it plays no matter
 * what the UI renders; video is attached by the tile that shows it.
 */

import { useCallback, useEffect, useReducer, useState } from 'react'
import { integration } from 'deepspace'
import {
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
  type VideoTrack,
} from 'livekit-client'
import { APP_ID } from '@/constants'

export type CallStatus = 'idle' | 'joining' | 'connected' | 'error'

export interface CallParticipant {
  identity: string
  name: string
  isLocal: boolean
  speaking: boolean
  micOn: boolean
  cameraOn: boolean
  video?: VideoTrack
}

/** LiveKit room names are per platform project, so namespace by app. */
export const callRoomName = (boardId: string) => `${APP_ID}:board:${boardId}`

const RERENDER_EVENTS = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.ActiveSpeakersChanged,
  RoomEvent.ParticipantNameChanged,
  RoomEvent.AudioPlaybackStatusChanged,
  RoomEvent.ConnectionStateChanged,
] as const

function toParticipant(p: Participant, isLocal: boolean): CallParticipant {
  const cam = p.getTrackPublication(Track.Source.Camera)
  return {
    identity: p.identity,
    name: p.name || p.identity,
    isLocal,
    speaking: p.isSpeaking,
    micOn: p.isMicrophoneEnabled,
    cameraOn: p.isCameraEnabled,
    video: cam && !cam.isMuted ? (cam.track as VideoTrack | undefined) : undefined,
  }
}

export function useCall(boardId: string, displayName?: string) {
  const [room, setRoom] = useState<Room | null>(null)
  const [status, setStatus] = useState<CallStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [, rerender] = useReducer((n: number) => n + 1, 0)

  const join = useCallback(async () => {
    if (room || status === 'joining') return
    setStatus('joining')
    setError(null)
    const r = new Room({ adaptiveStream: true, dynacast: true })
    try {
      const res = await integration.post('livekit/generate-token', {
        roomName: callRoomName(boardId),
        displayName,
      })
      if (!res.success) throw new Error(res.error)
      const { token, url } = res.data as { token: string; url: string }

      for (const ev of RERENDER_EVENTS) r.on(ev, rerender)
      r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach()
          el.dataset.callAudio = boardId
          document.body.appendChild(el)
        }
        rerender()
      })
      r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        track.detach().forEach((el) => el.remove())
        rerender()
      })
      r.on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
        setRoom(null)
        setStatus('idle')
        if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
          setError('You joined this call from another tab or device, so this one was disconnected.')
        } else if (reason !== undefined && reason !== DisconnectReason.CLIENT_INITIATED) {
          setError(`The call disconnected (${DisconnectReason[reason] ?? reason}).`)
        }
      })

      await r.connect(url, token)
      setRoom(r)
      setStatus('connected')
      try {
        await r.localParticipant.setMicrophoneEnabled(true)
      } catch {
        setError('Microphone unavailable — you joined muted.')
      }
      rerender()
    } catch (e) {
      r.removeAllListeners()
      void r.disconnect()
      setStatus('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [room, status, boardId, displayName])

  const leave = useCallback(() => {
    void room?.disconnect()
  }, [room])

  const toggleMic = useCallback(async () => {
    if (!room) return
    try {
      await room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled)
    } catch {
      setError('Could not access the microphone.')
    }
    rerender()
  }, [room])

  const toggleCamera = useCallback(async () => {
    if (!room) return
    try {
      await room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled)
    } catch {
      setError('Could not access the camera.')
    }
    rerender()
  }, [room])

  const startAudio = useCallback(() => {
    void room?.startAudio().then(rerender)
  }, [room])

  // Leave the call when the board unmounts.
  useEffect(
    () => () => {
      if (room) {
        room.removeAllListeners()
        void room.disconnect()
        document.querySelectorAll(`audio[data-call-audio="${CSS.escape(boardId)}"]`).forEach((el) => el.remove())
      }
    },
    [room, boardId],
  )

  const participants: CallParticipant[] = room
    ? [
        toParticipant(room.localParticipant, true),
        ...[...room.remoteParticipants.values()].map((p) => toParticipant(p, false)),
      ]
    : []

  return {
    status,
    error,
    participants,
    micOn: room?.localParticipant.isMicrophoneEnabled ?? false,
    cameraOn: room?.localParticipant.isCameraEnabled ?? false,
    audioBlocked: room ? !room.canPlaybackAudio : false,
    join,
    leave,
    toggleMic,
    toggleCamera,
    startAudio,
  }
}
