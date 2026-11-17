import { describe, expect, it } from 'vitest'
import { applyOps, describeDiff, diffShapes, fingerprint, restoreOps, toSnapshot } from './diff'
import type { BoardShape } from '@/components/board/types'

const shape = (id: string, over: Partial<BoardShape> = {}): BoardShape => ({
  id,
  type: 'sticky',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  props: { text: id },
  createdBy: 'u',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

describe('fingerprint', () => {
  it('ignores order, updatedAt, and null props', () => {
    const a = [shape('a'), shape('b', { props: { text: 'b', bend: null } })]
    const b = [shape('b', { updatedAt: 'later' }), shape('a')]
    expect(fingerprint(a)).toBe(fingerprint(b))
  })
  it('changes when content changes', () => {
    expect(fingerprint([shape('a')])).not.toBe(fingerprint([shape('a', { x: 5 })]))
  })
})

describe('describeDiff', () => {
  it('summarises adds, removes, edits and moves', () => {
    const prev = toSnapshot([shape('a'), shape('b'), shape('gone', { type: 'box' })])
    const next = toSnapshot([
      shape('a', { x: 40, props: { text: 'A!' } }),
      shape('b'),
      shape('c'),
      shape('d'),
      shape('arr', { type: 'arrow', props: { from: 'a', to: 'b' } }),
    ])
    expect(describeDiff(diffShapes(prev, next))).toBe('Added 2 notes and 1 arrow, removed 1 box, edited 1, moved 1')
  })
  it('returns null for no change', () => {
    const s = toSnapshot([shape('a')])
    expect(describeDiff(diffShapes(s, s))).toBeNull()
  })
  it('counts style changes separately from text', () => {
    const prev = toSnapshot([shape('x', { type: 'arrow', props: { route: 'straight' } })])
    const next = toSnapshot([shape('x', { type: 'arrow', props: { route: 'curve' } })])
    expect(describeDiff(diffShapes(prev, next))).toBe('Restyled 1')
  })
})

describe('restoreOps', () => {
  it('rebuilds the target and keeps ids and original creation time', () => {
    const target = toSnapshot([
      shape('a', { createdAt: '2025-12-31T00:00:00.000Z' }),
      shape('b', { x: 300, props: { text: 'old', color: 'blue' } }),
      shape('arr', { type: 'arrow', props: { from: 'a', to: 'b' } }),
    ])
    const current: BoardShape[] = [
      shape('b', { x: 10, props: { text: 'new' } }),
      shape('extra'),
      shape('arr2', { type: 'arrow', props: { from: 'b', to: 'extra' } }),
    ]

    // Apply to a tiny in-memory store and compare.
    let live = [...current]
    applyOps(
      {
        addShape: (s) => (live = [...live, { ...shape(s.id!), ...s, createdAt: 'now' } as BoardShape]),
        deleteShape: (id) => (live = live.filter((x) => x.id !== id)),
        move: (id, x, y) => (live = live.map((s) => (s.id === id ? { ...s, x, y } : s))),
        resize: (id, width, height) => (live = live.map((s) => (s.id === id ? { ...s, width, height } : s))),
        update: (id, props) => (live = live.map((s) => (s.id === id ? { ...s, props: { ...s.props, ...props } } : s))),
      },
      restoreOps(toSnapshot(current), target),
    )

    expect(fingerprint(toSnapshot(live))).toBe(fingerprint(target))
    expect(live.find((s) => s.id === 'a')!.props.originalCreatedAt).toBe('2025-12-31T00:00:00.000Z')
    // The snapshot of the restored board reports the original creation time.
    expect(toSnapshot(live).find((s) => s.id === 'a')!.createdAt).toBe('2025-12-31T00:00:00.000Z')
  })

  it('deletes arrows before shapes and adds them after', () => {
    const ops = restoreOps(
      toSnapshot([shape('x'), shape('ax', { type: 'arrow' })]),
      toSnapshot([shape('y'), shape('ay', { type: 'arrow' })]),
    )
    expect(ops.map((o) => (o.op === 'add' ? `add:${o.shape.id}` : o.op === 'delete' ? `del:${o.id}` : o.op))).toEqual([
      'del:ax',
      'del:x',
      'add:y',
      'add:ay',
    ])
  })

  it('is empty when nothing differs', () => {
    const s = toSnapshot([shape('a')])
    expect(restoreOps(s, s)).toEqual([])
  })
})
