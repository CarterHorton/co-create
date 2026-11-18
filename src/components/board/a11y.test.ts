import { describe, expect, it } from 'vitest'
import { panToShow, readingOrder, shapeName } from './a11y'
import type { BoardShape } from './types'

const shape = (id: string, x: number, y: number, extra: Partial<BoardShape> = {}): BoardShape => ({
  id,
  type: 'sticky',
  x,
  y,
  width: 100,
  height: 100,
  props: {},
  createdBy: 'u',
  createdAt: '',
  updatedAt: '',
  ...extra,
})

describe('readingOrder', () => {
  it('reads rows top to bottom, each row left to right', () => {
    const shapes = [shape('c', 0, 300), shape('b', 400, 10), shape('a', 0, 0), shape('d', 200, 310)]
    expect(readingOrder(shapes).map((s) => s.id)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('treats slightly offset tops as one row', () => {
    const shapes = [shape('right', 300, 0), shape('left', 0, 30)]
    expect(readingOrder(shapes).map((s) => s.id)).toEqual(['left', 'right'])
  })
  it('puts arrows last, in the order of the shapes they start from', () => {
    const shapes = [
      shape('a2', 0, 0, { type: 'arrow', props: { from: 'y', to: 'x' } }),
      shape('x', 0, 0),
      shape('a1', 0, 0, { type: 'arrow', props: { from: 'x', to: 'y' } }),
      shape('y', 300, 0),
    ]
    expect(readingOrder(shapes).map((s) => s.id)).toEqual(['x', 'y', 'a1', 'a2'])
  })
})

describe('shapeName', () => {
  it('names notes by kind and text', () => {
    const s = shape('s', 0, 0, { props: { text: 'Buy\nmilk' } })
    expect(shapeName(s, new Map())).toBe('Sticky note: Buy milk')
    expect(shapeName(shape('b', 0, 0, { type: 'box' }), new Map())).toBe('Box (empty)')
  })
  it('names arrows by their ends', () => {
    const from = shape('f', 0, 0, { type: 'text', props: { text: 'Login' } })
    const to = shape('t', 0, 0, { type: 'box' })
    const a = shape('a', 0, 0, { type: 'arrow', props: { from: 'f', to: 't' } })
    expect(shapeName(a, new Map([from, to].map((s) => [s.id, s])))).toBe('Arrow from “Login” to a box')
  })
})

describe('panToShow', () => {
  const view = { width: 800, height: 600 }
  const cam = { x: 0, y: 0, zoom: 1 }
  it('leaves a visible shape alone', () => {
    expect(panToShow(cam, { x: 100, y: 100, width: 100, height: 100 }, view)).toBe(cam)
  })
  it('pans just enough to show an off-screen shape', () => {
    expect(panToShow(cam, { x: 900, y: 100, width: 100, height: 100 }, view, 50)).toEqual({ x: -250, y: 0, zoom: 1 })
    expect(panToShow(cam, { x: -200, y: -200, width: 100, height: 100 }, view, 50)).toEqual({ x: 250, y: 250, zoom: 1 })
  })
  it('accounts for zoom', () => {
    const z = { x: 0, y: 0, zoom: 2 }
    expect(panToShow(z, { x: 400, y: 0, width: 50, height: 50 }, view, 0)).toEqual({ x: -100, y: 0, zoom: 2 })
  })
})
