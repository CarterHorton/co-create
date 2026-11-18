import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnnouncer, createCoalescer, createLocalLog, describeRemote, diffShapes, type RemoteChange } from './announce'
import type { BoardShape } from './types'

const shape = (id: string, extra: Partial<BoardShape> = {}): BoardShape => ({
  id,
  type: 'sticky',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  props: {},
  createdBy: 'u',
  createdAt: '',
  updatedAt: '',
  ...extra,
})

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createAnnouncer', () => {
  it('merges a burst into one update', () => {
    const emit = vi.fn()
    const a = createAnnouncer(emit, 1000)
    a.say('Sticky note added')
    a.say('2 shapes selected', 'selection')
    expect(emit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(0)
    expect(emit).toHaveBeenCalledExactlyOnceWith('Sticky note added. 2 shapes selected')
  })

  it('never updates more often than the gap, and keeps only the latest per key', () => {
    const emit = vi.fn()
    const a = createAnnouncer(emit, 1000)
    a.say('Moved', 'move')
    vi.advanceTimersByTime(0)
    for (let i = 0; i < 10; i++) a.say('Moved', 'move')
    a.say('2 shapes selected', 'selection')
    a.say('3 shapes selected', 'selection')
    vi.advanceTimersByTime(500)
    expect(emit).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(500)
    expect(emit).toHaveBeenCalledTimes(2)
    expect(emit).toHaveBeenLastCalledWith('Moved. 3 shapes selected')
  })

  it('dispose drops what is pending', () => {
    const emit = vi.fn()
    const a = createAnnouncer(emit)
    a.say('Moved')
    a.dispose()
    vi.runAllTimers()
    expect(emit).not.toHaveBeenCalled()
  })
})

describe('createCoalescer', () => {
  it('flushes everything that arrived within the window together', () => {
    const flush = vi.fn()
    const c = createCoalescer<number>(2000, flush)
    c.push(1)
    vi.advanceTimersByTime(1500)
    c.push(2)
    vi.advanceTimersByTime(500)
    expect(flush).toHaveBeenCalledExactlyOnceWith([1, 2])
    c.push(3)
    vi.advanceTimersByTime(2000)
    expect(flush).toHaveBeenLastCalledWith([3])
  })
})

describe('describeRemote', () => {
  const change = (shapeId: string, action: RemoteChange['action'], who: string | null, kind = 'sticky'): RemoteChange => ({
    shapeId,
    action,
    who,
    kind,
  })
  it('names a single change', () => {
    expect(describeRemote([change('a', 'added', 'Alex')])).toBe('Alex added a sticky note')
    expect(describeRemote([change('a', 'moved', null, 'box')])).toBe('A collaborator moved a box')
  })
  it('counts a drag of one shape once', () => {
    expect(describeRemote([change('a', 'moved', 'Alex'), change('a', 'moved', 'Alex')])).toBe('Alex moved a sticky note')
  })
  it('summarizes several changes', () => {
    expect(describeRemote([change('a', 'added', 'Alex'), change('b', 'deleted', 'Sam'), change('c', 'moved', null)])).toBe(
      '3 changes by collaborators',
    )
    expect(describeRemote([change('a', 'added', 'Alex'), change('b', 'edited', 'Alex')])).toBe('2 changes by Alex')
  })
  it('says nothing for nothing', () => {
    expect(describeRemote([])).toBe('')
  })
})

describe('createLocalLog', () => {
  it('recognizes our own adds once, by type and position', () => {
    let t = 0
    const log = createLocalLog(3000, () => t)
    log.expectAdd({ type: 'sticky', x: 10, y: 20 })
    expect(log.isOwnAdd(shape('new', { x: 10, y: 20 }))).toBe(true)
    expect(log.isOwnAdd(shape('other', { x: 10, y: 20 }))).toBe(false)
    log.expectAdd({ type: 'arrow', props: { from: 'a', to: 'b' } })
    t = 5000
    expect(log.isOwnAdd(shape('arr', { type: 'arrow', props: { from: 'a', to: 'b' } }))).toBe(false)
  })
  it('remembers our edits for a while, and everything during a quiet period', () => {
    let t = 0
    const log = createLocalLog(3000, () => t)
    log.touch('a')
    expect(log.isOwnEdit('a')).toBe(true)
    expect(log.isOwnEdit('b')).toBe(false)
    t = 4000
    expect(log.isOwnEdit('a')).toBe(false)
    log.quiet(1000)
    expect(log.isOwnEdit('b')).toBe(true)
    expect(log.isOwnAdd(shape('c'))).toBe(true)
  })
})

describe('diffShapes', () => {
  it('finds added, removed, moved and edited shapes', () => {
    const a = shape('a')
    const b = shape('b')
    const c = shape('c')
    const prev = new Map([a, b, c].map((s) => [s.id, s]))
    const next = [a, { ...b, x: 5 }, { ...c, props: { text: 'hi' } }, shape('d')]
    const d = diffShapes(prev, next)
    expect(d.added.map((s) => s.id)).toEqual(['d'])
    expect(d.removed).toEqual([])
    expect(d.changed.map((x) => [x.shape.id, x.moved])).toEqual([
      ['b', true],
      ['c', false],
    ])
    expect(diffShapes(prev, [a]).removed.map((s) => s.id)).toEqual(['b', 'c'])
  })
})
