/**
 * Follow mode, the pure part (no React, no DOM), so it is unit-tested:
 *   - Each client publishes its viewport — camera x/y/zoom plus its screen
 *     size — in its presence state under `viewport`.
 *   - parseViewport validates and clamps what a peer sent before it is used.
 *   - fitCamera turns a peer's visible area into a camera for our own screen.
 *   - approachCamera moves a camera a step toward a target (smooth tracking).
 */

import { MAX_ZOOM, MIN_ZOOM } from './zoom'

/** A camera: screen = world × zoom + (x, y). */
export interface Camera {
  x: number
  y: number
  zoom: number
}

/** What a client publishes: its camera and its screen (viewport) size in px. */
export interface Viewport extends Camera {
  w: number
  h: number
}

/** A world-space rectangle. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Presence-state keys this feature uses. */
export const VIEWPORT_KEY = 'viewport'
export const SPOTLIGHT_KEY = 'spotlight'

/** Publish at most this often (ms): ≤ 10 updates a second. */
export const PUBLISH_INTERVAL_MS = 100

/** Camera offsets beyond this are nonsense (or hostile); clamp them. */
const MAX_OFFSET = 1e7
/** Screen sizes are clamped to [MIN_SCREEN, MAX_SCREEN] px. */
const MIN_SCREEN = 50
const MAX_SCREEN = 16_384

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A peer's published viewport, validated and clamped; null if unusable. */
export function parseViewport(raw: unknown): Viewport | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const x = num(o.x)
  const y = num(o.y)
  const zoom = num(o.zoom)
  const w = num(o.w)
  const h = num(o.h)
  if (x === null || y === null || zoom === null || w === null || h === null) return null
  if (zoom <= 0 || w <= 0 || h <= 0) return null
  return {
    x: clamp(x, -MAX_OFFSET, MAX_OFFSET),
    y: clamp(y, -MAX_OFFSET, MAX_OFFSET),
    zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM),
    w: clamp(w, MIN_SCREEN, MAX_SCREEN),
    h: clamp(h, MIN_SCREEN, MAX_SCREEN),
  }
}

/** The world-space area a viewport shows. */
export function visibleRect(v: Viewport): Rect {
  return { x: -v.x / v.zoom, y: -v.y / v.zoom, width: v.w / v.zoom, height: v.h / v.zoom }
}

/**
 * The camera that shows all of `rect` on a `screen`, centred, as large as fits
 * (within the app's zoom limits).
 */
export function fitCamera(rect: Rect, screen: { width: number; height: number }): Camera {
  const sw = Math.max(1, screen.width)
  const sh = Math.max(1, screen.height)
  const zoom = clamp(Math.min(sw / Math.max(1e-6, rect.width), sh / Math.max(1e-6, rect.height)), MIN_ZOOM, MAX_ZOOM)
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  return { zoom, x: sw / 2 - cx * zoom, y: sh / 2 - cy * zoom }
}

/** The camera that fits a peer's visible area to our screen. */
export function followCamera(peer: Viewport, screen: { width: number; height: number }): Camera {
  return fitCamera(visibleRect(peer), screen)
}

/** Equal within half a pixel of offset and a hair of zoom. */
export function sameCamera(a: Camera, b: Camera, eps = 0.5): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.zoom - b.zoom) < 1e-3
}

export function sameViewport(a: Viewport | null, b: Viewport | null): boolean {
  if (!a || !b) return a === b
  return sameCamera(a, b) && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1
}

/**
 * One smoothing step from `from` toward `to` after `dtMs`: exponential easing
 * (about 90% of the way in `settleMs`), snapping exactly onto `to` once close.
 * The view is interpolated around the screen centre, so zooming doesn't swing
 * the picture sideways.
 */
export function approachCamera(
  from: Camera,
  to: Camera,
  dtMs: number,
  screen: { width: number; height: number },
  settleMs = 250,
): Camera {
  if (sameCamera(from, to)) return to
  const t = 1 - Math.pow(0.1, Math.max(0, dtMs) / settleMs)
  if (t >= 1) return to
  // World point at the screen centre for each camera, interpolated with the zoom.
  const cxs = screen.width / 2
  const cys = screen.height / 2
  const wx0 = (cxs - from.x) / from.zoom
  const wy0 = (cys - from.y) / from.zoom
  const wx1 = (cxs - to.x) / to.zoom
  const wy1 = (cys - to.y) / to.zoom
  const zoom = from.zoom * Math.pow(to.zoom / from.zoom, t)
  const wx = wx0 + (wx1 - wx0) * t
  const wy = wy0 + (wy1 - wy0) * t
  const next = { zoom, x: cxs - wx * zoom, y: cys - wy * zoom }
  return sameCamera(next, to) ? to : next
}
