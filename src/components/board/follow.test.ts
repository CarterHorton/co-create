import { describe, expect, it } from 'vitest'
import { approachCamera, fitCamera, followCamera, parseViewport, sameCamera, sameViewport, visibleRect } from './follow'
import { MAX_ZOOM, MIN_ZOOM } from './zoom'

describe('parseViewport', () => {
  it('accepts a well-formed viewport', () => {
    expect(parseViewport({ x: 10, y: -20, zoom: 1.5, w: 800, h: 600 })).toEqual({ x: 10, y: -20, zoom: 1.5, w: 800, h: 600 })
  })

  it('rejects missing, non-numeric, non-finite and non-positive values', () => {
    expect(parseViewport(null)).toBeNull()
    expect(parseViewport('nope')).toBeNull()
    expect(parseViewport({ x: 0, y: 0, zoom: 1, w: 800 })).toBeNull()
    expect(parseViewport({ x: '1', y: 0, zoom: 1, w: 800, h: 600 })).toBeNull()
    expect(parseViewport({ x: NaN, y: 0, zoom: 1, w: 800, h: 600 })).toBeNull()
    expect(parseViewport({ x: 0, y: Infinity, zoom: 1, w: 800, h: 600 })).toBeNull()
    expect(parseViewport({ x: 0, y: 0, zoom: 0, w: 800, h: 600 })).toBeNull()
    expect(parseViewport({ x: 0, y: 0, zoom: 1, w: -5, h: 600 })).toBeNull()
  })

  it('clamps extreme values', () => {
    const v = parseViewport({ x: 1e12, y: -1e12, zoom: 1000, w: 1e9, h: 1 })!
    expect(v.x).toBe(1e7)
    expect(v.y).toBe(-1e7)
    expect(v.zoom).toBe(MAX_ZOOM)
    expect(v.w).toBe(16_384)
    expect(v.h).toBe(50)
    expect(parseViewport({ x: 0, y: 0, zoom: 0.0001, w: 800, h: 600 })!.zoom).toBe(MIN_ZOOM)
  })
})

describe('visibleRect / fitCamera', () => {
  it('computes the world area a camera shows', () => {
    expect(visibleRect({ x: -100, y: -50, zoom: 2, w: 800, h: 600 })).toEqual({ x: 50, y: 25, width: 400, height: 300 })
  })

  it('reproduces the same camera on an identical screen', () => {
    const peer = { x: -120, y: 40, zoom: 1.25, w: 1000, h: 700 }
    const cam = followCamera(peer, { width: 1000, height: 700 })
    expect(sameCamera(cam, peer)).toBe(true)
  })

  it('fits the whole area on a smaller screen, centred', () => {
    // Peer sees world (0,0)–(1000,500); we have 500×500: zoom 0.5, letterboxed vertically.
    const cam = fitCamera({ x: 0, y: 0, width: 1000, height: 500 }, { width: 500, height: 500 })
    expect(cam.zoom).toBeCloseTo(0.5)
    expect(cam.x).toBeCloseTo(0)
    expect(cam.y).toBeCloseTo(125)
  })

  it('keeps the zoom within the app limits', () => {
    expect(fitCamera({ x: 0, y: 0, width: 1, height: 1 }, { width: 1000, height: 1000 }).zoom).toBe(MAX_ZOOM)
    expect(fitCamera({ x: 0, y: 0, width: 1e6, height: 1e6 }, { width: 100, height: 100 }).zoom).toBe(MIN_ZOOM)
  })
})

describe('approachCamera', () => {
  const screen = { width: 800, height: 600 }

  it('moves part of the way, then snaps onto the target', () => {
    const from = { x: 0, y: 0, zoom: 1 }
    const to = { x: -400, y: 200, zoom: 1 }
    const mid = approachCamera(from, to, 16, screen)
    expect(mid.x).toBeLessThan(0)
    expect(mid.x).toBeGreaterThan(-400)
    let c = from
    for (let i = 0; i < 200; i++) c = approachCamera(c, to, 16, screen)
    expect(c).toBe(to)
  })

  it('returns the target once it is within half a pixel', () => {
    const to = { x: 10, y: 10, zoom: 1 }
    expect(approachCamera({ x: 10.2, y: 9.9, zoom: 1 }, to, 16, screen)).toBe(to)
  })

  it('interpolates zoom geometrically', () => {
    const c = approachCamera({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0, zoom: 2 }, 250, screen)
    expect(c.zoom).toBeGreaterThan(1)
    expect(c.zoom).toBeLessThan(2)
  })
})

describe('sameViewport', () => {
  it('treats null and tiny changes sensibly', () => {
    const v = { x: 0, y: 0, zoom: 1, w: 800, h: 600 }
    expect(sameViewport(null, null)).toBe(true)
    expect(sameViewport(v, null)).toBe(false)
    expect(sameViewport(v, { ...v, x: 0.1 })).toBe(true)
    expect(sameViewport(v, { ...v, x: 5 })).toBe(false)
    expect(sameViewport(v, { ...v, w: 900 })).toBe(false)
  })
})
