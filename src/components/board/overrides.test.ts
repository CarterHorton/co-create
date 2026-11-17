import { describe, expect, it } from 'vitest'
import type { CanvasShapeClient } from 'deepspace'
import { applyOverrides, nextField, samePair, type Override } from './overrides'

const shape = (over: Partial<CanvasShapeClient> = {}): CanvasShapeClient => ({
  id: 's1',
  type: 'sticky',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  props: { text: 'a', color: 'white' },
  createdBy: 'u',
  createdAt: '',
  updatedAt: '',
  ...over,
})

describe('applyOverrides', () => {
  it('shows my local move while the server copy is unchanged', () => {
    const o: Override = { pos: nextField(undefined, [0, 0], [50, 60], samePair) }
    const [s] = applyOverrides([shape()], { s1: o })
    expect([s.x, s.y]).toEqual([50, 60])
  })

  it('keeps the original base across repeated local moves', () => {
    let pos = nextField(undefined, [0, 0] as [number, number], [10, 10], samePair)
    pos = nextField(pos, [0, 0], [20, 20], samePair) // server still at 0,0 (never echoes my moves)
    expect(pos.base).toEqual([0, 0])
    expect(applyOverrides([shape()], { s1: { pos } })[0].x).toBe(20)
  })

  it('lets a peer move win over my stale local move', () => {
    const o: Override = { pos: nextField(undefined, [0, 0], [50, 60], samePair) }
    const [s] = applyOverrides([shape({ x: 300, y: 300 })], { s1: o })
    expect([s.x, s.y]).toEqual([300, 300])
  })

  it('merges props per key and drops only the key a peer changed', () => {
    const o: Override = {
      props: {
        text: nextField(undefined, 'a', 'mine', Object.is),
        color: nextField(undefined, 'white', 'blue', Object.is),
      },
    }
    const [s] = applyOverrides([shape({ props: { text: 'theirs', color: 'white' } })], { s1: o })
    expect(s.props).toEqual({ text: 'theirs', color: 'blue' })
  })

  it('leaves shapes without overrides untouched', () => {
    const base = shape()
    expect(applyOverrides([base], {})[0]).toBe(base)
  })
})
