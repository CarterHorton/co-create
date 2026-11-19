import { describe, expect, it } from 'vitest'
import { contains, frameContents, frameLabel, frameMembership, withFrameContents } from './frame'
import { cycleNoteType, nextNoteType, noteTypeOf, specPrefix, stickyKindName } from './noteTypes'
import { shapeName } from './a11y'
import type { BoardShape } from './types'

const shape = (id: string, type: string, x: number, y: number, w = 100, h = 100, props: Record<string, unknown> = {}): BoardShape => ({
  id,
  type,
  x,
  y,
  width: w,
  height: h,
  props,
  createdBy: 'u',
  createdAt: '',
  updatedAt: '',
})

describe('frame geometry', () => {
  const f = shape('f', 'frame', 0, 0, 500, 300, { text: 'Login page' })
  const inside = shape('a', 'sticky', 10, 10)
  const edge = shape('b', 'sticky', 400, 200) // touches the corner exactly
  const out = shape('c', 'sticky', 450, 10) // sticks out
  const arr = shape('x', 'arrow', 0, 0, 0, 0, { from: 'a', to: 'b' })

  it('contains shapes fully inside, edges included', () => {
    expect(contains(f, inside)).toBe(true)
    expect(contains(f, edge)).toBe(true)
    expect(contains(f, out)).toBe(false)
  })

  it('lists contents without arrows or itself', () => {
    expect(frameContents(f, [f, inside, edge, out, arr]).map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('moves a frame with its contents, without duplicates', () => {
    const all = [f, inside, edge, out, arr]
    expect(withFrameContents([f, inside], all).map((s) => s.id)).toEqual(['f', 'a', 'b'])
    expect(withFrameContents([out], all).map((s) => s.id)).toEqual(['c'])
  })

  it('assigns each shape to its innermost frame', () => {
    const inner = shape('g', 'frame', 5, 5, 200, 200)
    const m = frameMembership([f, inner, inside, edge, out])
    expect(m.get('a')?.id).toBe('g')
    expect(m.get('b')?.id).toBe('f')
    expect(m.has('c')).toBe(false)
    expect(m.has('g')).toBe(false)
  })

  it('names frames with their item count', () => {
    expect(frameLabel(f, [f, inside, edge, out])).toBe('Frame: Login page, 2 items')
    expect(frameLabel(f, [f, inside])).toBe('Frame: Login page, 1 item')
    expect(frameLabel(shape('e', 'frame', 0, 0, 10, 10), [])).toBe('Frame (untitled), empty')
    const byId = new Map([f, inside, edge].map((s) => [s.id, s]))
    expect(shapeName(f, byId)).toBe('Frame: Login page, 2 items')
  })
})

describe('sticky note types', () => {
  const sticky = (noteType?: string) => shape('s', 'sticky', 0, 0, 100, 100, { text: 'Hi', noteType })

  it('defaults to idea, and only stickies have a type', () => {
    expect(noteTypeOf(sticky())).toBe('idea')
    expect(noteTypeOf(sticky('bogus'))).toBe('idea')
    expect(noteTypeOf(sticky('risk'))).toBe('risk')
    expect(noteTypeOf(shape('b', 'box', 0, 0, 1, 1, { noteType: 'risk' }))).toBeNull()
  })

  it('cycles idea → question → decision → risk → idea', () => {
    expect(nextNoteType('idea')).toBe('question')
    expect(nextNoteType('risk')).toBe('idea')
    expect(cycleNoteType([sticky('decision')])).toBe('risk')
    expect(cycleNoteType([sticky('decision'), sticky()])).toBe('question')
  })

  it('puts the type in the accessible name and the spec prefix', () => {
    expect(stickyKindName(sticky())).toBe('Sticky note')
    expect(stickyKindName(sticky('question'))).toBe('Question sticky note')
    expect(shapeName(sticky('decision'), new Map())).toBe('Decision sticky note: Hi')
    expect(shapeName(sticky(), new Map())).toBe('Sticky note: Hi')
    expect(specPrefix(sticky('risk'))).toBe('**Risk:** ')
    expect(specPrefix(sticky())).toBe('')
  })
})
