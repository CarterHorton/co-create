/**
 * Follow mode for signed-in boards (see follow.ts for the maths).
 *
 *   - Publishes this client's viewport (camera + screen size) in its presence
 *     state, at most every PUBLISH_INTERVAL_MS and only when it changed.
 *   - follow(userId): our camera smoothly tracks theirs, fitting their visible
 *     area to our screen (a jump instead, under prefers-reduced-motion).
 *   - Following stops on Escape, stop(), when we pan / zoom ourselves (any
 *     camera change we didn't make), or when they leave. Each is announced.
 *   - Spotlight: "ask everyone to follow me" is only a presence flag. Others
 *     see a prompt they may accept or dismiss; nobody's view is ever forced.
 *
 * Without presence (guest boards) the hook does nothing.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { BoardPresence } from './types'
import {
  PUBLISH_INTERVAL_MS,
  SPOTLIGHT_KEY,
  VIEWPORT_KEY,
  approachCamera,
  followCamera,
  parseViewport,
  sameViewport,
  type Camera,
  type Viewport,
} from './follow'

interface Options {
  presence: BoardPresence | undefined
  cam: Camera
  setCam: Dispatch<SetStateAction<Camera>>
  /** Our viewport's size in px. */
  viewSize: { width: number; height: number }
  /** Screen-reader announcement (see announce.ts). */
  say: (text: string, key?: string) => void
}

export interface FollowState {
  /** Available at all (signed-in, multi-user board). */
  enabled: boolean
  following: { userId: string; userName: string } | null
  follow: (userId: string) => void
  stop: () => void
  /** We are asking everyone to follow us. */
  spotlight: boolean
  setSpotlight: (on: boolean) => void
  /** A collaborator asking everyone to follow them, not yet accepted or dismissed. */
  spotlightRequest: { userId: string; userName: string } | null
  dismissSpotlight: (userId: string) => void
}

const nameOf = (p: { userName?: string } | undefined) => (p?.userName || 'Someone').slice(0, 80)

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export function useFollow({ presence, cam, setCam, viewSize, say }: Options): FollowState {
  const enabled = !!presence
  const peers = presence?.peers
  const updateState = presence?.updateState

  // Latest values for the animation loop and timers.
  const camRef = useRef(cam)
  const viewRef = useRef(viewSize)
  const peersRef = useRef(peers)
  useEffect(() => {
    camRef.current = cam
    viewRef.current = viewSize
    peersRef.current = peers
  })

  // ── Publish our viewport ───────────────────────────────────────────────
  const published = useRef<Viewport | null>(null)
  const lastPublishAt = useRef(-Infinity)
  const publishTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Updates sent while the socket is closed are lost, and a new connection
  // starts with empty state: publish again on every (re)connect.
  const connected = presence?.connected ?? true
  useEffect(() => {
    published.current = null
  }, [connected])
  useEffect(() => {
    if (!updateState || !connected || viewSize.width <= 0 || viewSize.height <= 0) return
    const publish = () => {
      publishTimer.current = null
      const c = camRef.current
      const v = viewRef.current
      const vp: Viewport = { x: c.x, y: c.y, zoom: c.zoom, w: v.width, h: v.height }
      if (sameViewport(vp, published.current)) return
      published.current = vp
      lastPublishAt.current = Date.now()
      updateState({ [VIEWPORT_KEY]: vp })
    }
    if (publishTimer.current) return // a trailing publish is already due; it reads the latest camera
    const wait = lastPublishAt.current + PUBLISH_INTERVAL_MS - Date.now()
    if (wait <= 0) publish()
    else publishTimer.current = setTimeout(publish, wait)
  }, [cam, viewSize, updateState, connected])
  useEffect(
    () => () => {
      if (publishTimer.current) clearTimeout(publishTimer.current)
    },
    [],
  )

  // ── Following ──────────────────────────────────────────────────────────
  const [following, setFollowing] = useState<{ userId: string; userName: string } | null>(null)
  /**
   * Cameras this hook set. React can render a tick or two behind the frame loop,
   * so the camera we see may be an earlier one of ours, not the latest: only a
   * camera NOT in this set means the user moved it.
   */
  const applied = useRef<WeakSet<Camera> | null>(null)
  const followingRef = useRef(following)
  useEffect(() => {
    followingRef.current = following
  }, [following])

  const follow = useCallback(
    (userId: string) => {
      const p = peersRef.current?.find((x) => x.userId === userId)
      if (!p) return
      applied.current = null
      followingRef.current = { userId, userName: nameOf(p) }
      setFollowing(followingRef.current)
      say(`Following ${nameOf(p)}. Press Escape to stop.`, 'follow')
    },
    [say],
  )

  const stopWith = useCallback(
    (message: (name: string) => string) => {
      const f = followingRef.current
      if (!f) return
      followingRef.current = null
      applied.current = null
      setFollowing(null)
      say(message(f.userName), 'follow')
    },
    [say],
  )
  const stop = useCallback(() => stopWith((n) => `Stopped following ${n}`), [stopWith])

  // Track their camera, one step per frame.
  const followingId = following?.userId ?? null
  useEffect(() => {
    if (!followingId) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      const peer = peersRef.current?.find((p) => p.userId === followingId)
      const vp = parseViewport(peer?.state[VIEWPORT_KEY])
      const screen = viewRef.current
      if (vp && screen.width > 0 && screen.height > 0) {
        const target = followCamera(vp, screen)
        const cur = camRef.current
        const next = prefersReducedMotion() ? target : approachCamera(cur, target, dt, screen)
        if (next.x !== cur.x || next.y !== cur.y || next.zoom !== cur.zoom) {
          ;(applied.current ??= new WeakSet()).add(next)
          camRef.current = next
          setCam(next)
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [followingId, setCam])

  // Our own pan / zoom (a camera this hook didn't set) takes the view back.
  useEffect(() => {
    if (followingId && applied.current && !applied.current.has(cam)) stop()
  }, [cam, followingId, stop])

  // They left.
  useEffect(() => {
    if (followingId && peers && !peers.some((p) => p.userId === followingId)) {
      stopWith((n) => `${n} left; stopped following`)
    }
  }, [peers, followingId, stopWith])

  // Escape stops (unless something else, like a menu or an editor, used it).
  useEffect(() => {
    if (!followingId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [followingId, stop])

  // ── Spotlight ──────────────────────────────────────────────────────────
  const [spotlight, setSpotlightState] = useState(false)
  const setSpotlight = useCallback(
    (on: boolean) => {
      setSpotlightState(on)
      say(on ? 'Asked everyone to follow you' : 'Stopped asking everyone to follow you', 'spotlight')
    },
    [say],
  )
  // Sent on change and again on every (re)connect.
  useEffect(() => {
    if (connected) updateState?.({ [SPOTLIGHT_KEY]: spotlight })
  }, [connected, spotlight, updateState])

  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set())
  const dismissSpotlight = useCallback((userId: string) => setDismissed((d) => new Set(d).add(userId)), [])
  const asking = useMemo(() => (peers ?? []).filter((p) => p.state[SPOTLIGHT_KEY] === true), [peers])
  // Someone who stops asking may ask again later: forget the dismissal.
  useEffect(() => {
    setDismissed((d) => {
      const kept = [...d].filter((id) => asking.some((p) => p.userId === id))
      return kept.length === d.size ? d : new Set(kept)
    })
  }, [asking])
  const req = asking.find((p) => p.userId !== followingId && !dismissed.has(p.userId))
  const spotlightRequest = useMemo(() => (req ? { userId: req.userId, userName: nameOf(req) } : null), [req])

  const announcedRequest = useRef<string | null>(null)
  useEffect(() => {
    const id = spotlightRequest?.userId ?? null
    if (id && id !== announcedRequest.current) say(`${spotlightRequest!.userName} asks everyone to follow them`, 'spotlight')
    announcedRequest.current = id
  }, [spotlightRequest, say])

  return { enabled, following, follow, stop, spotlight, setSpotlight, spotlightRequest, dismissSpotlight }
}
