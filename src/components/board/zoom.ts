/**
 * Zoom moves in fixed 25% steps (25%, 50%, … 300%) so the level always reads
 * as a round number. Ctrl/⌘ + wheel and the +/− buttons both step one level.
 */

export const ZOOM_STEP = 0.25
export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 3

const EPS = 1e-6

/** The next level up (dir = 1) or down (dir = -1). An off-grid zoom snaps to the nearest level in that direction. */
export function stepZoom(zoom: number, dir: 1 | -1): number {
  const k = zoom / ZOOM_STEP
  const next = dir > 0 ? Math.floor(k + EPS) + 1 : Math.ceil(k - EPS) - 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next * ZOOM_STEP))
}

/**
 * Turns wheel deltas into whole zoom steps. A mouse wheel notch (≈100px)
 * is one step; trackpad pinches send many tiny deltas, which accumulate
 * until they add up to a step. Reversing direction starts over.
 */
export function createWheelStepper(threshold = 50) {
  let acc = 0
  return (deltaY: number, deltaMode = 0): 1 | -1 | 0 => {
    const px = deltaMode === 1 ? deltaY * 40 : deltaMode === 2 ? deltaY * 800 : deltaY
    if (Math.sign(px) !== Math.sign(acc)) acc = 0
    acc += px
    if (Math.abs(acc) < threshold) return 0
    acc = 0
    return px < 0 ? 1 : -1 // wheel up / pinch out = zoom in
  }
}
