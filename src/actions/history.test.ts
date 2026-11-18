import { describe, expect, it } from 'vitest'
import {
  MAX_MARKDOWN_CHARS,
  MAX_MESSAGE_LENGTH,
  MAX_SNAPSHOT_CHARS,
  MAX_TITLE_LENGTH,
  parseSpecParams,
  parseVersionParams,
} from './history'

const shape = { id: 'a', type: 'sticky', x: 0, y: 0, props: { text: 'hi' } }

describe('parseVersionParams', () => {
  it('accepts a valid version and defaults auto to false', () => {
    expect(parseVersionParams({ boardId: 'b1', message: 'Added a sticky', snapshot: [shape] })).toEqual({
      boardId: 'b1',
      message: 'Added a sticky',
      auto: false,
      snapshot: [shape],
    })
    expect(parseVersionParams({ boardId: 'b1', message: 'm', auto: true, snapshot: [] })).toMatchObject({ auto: true })
  })

  it('rejects a missing or non-string boardId', () => {
    for (const boardId of [undefined, '', '  ', 42, { id: 'b1' }, 'x'.repeat(201)]) {
      expect(parseVersionParams({ boardId, message: 'm', snapshot: [] })).toHaveProperty('error')
    }
  })

  it('rejects empty or overlong messages', () => {
    expect(parseVersionParams({ boardId: 'b', message: '', snapshot: [] })).toHaveProperty('error')
    expect(parseVersionParams({ boardId: 'b', message: 7, snapshot: [] })).toHaveProperty('error')
    expect(parseVersionParams({ boardId: 'b', message: 'x'.repeat(MAX_MESSAGE_LENGTH), snapshot: [] })).not.toHaveProperty('error')
    expect(parseVersionParams({ boardId: 'b', message: 'x'.repeat(MAX_MESSAGE_LENGTH + 1), snapshot: [] })).toHaveProperty('error')
  })

  it('rejects a non-boolean auto flag', () => {
    expect(parseVersionParams({ boardId: 'b', message: 'm', auto: 'yes', snapshot: [] })).toHaveProperty('error')
  })

  it('rejects snapshots that are not arrays of objects', () => {
    for (const snapshot of [undefined, null, 'shapes', { 0: shape }, [1], [null], [[shape]]]) {
      expect(parseVersionParams({ boardId: 'b', message: 'm', snapshot })).toHaveProperty('error')
    }
  })

  it('rejects snapshots that do not serialize', () => {
    const cyclic: Record<string, unknown> = { id: 'c' }
    cyclic.self = cyclic
    expect(parseVersionParams({ boardId: 'b', message: 'm', snapshot: [cyclic] })).toHaveProperty('error')
    expect(parseVersionParams({ boardId: 'b', message: 'm', snapshot: [{ n: 1n }] })).toHaveProperty('error')
  })

  it('rejects oversized snapshots', () => {
    const big = [{ id: 'big', props: { text: 'x'.repeat(MAX_SNAPSHOT_CHARS) } }]
    expect(parseVersionParams({ boardId: 'b', message: 'm', snapshot: big })).toHaveProperty('error')
    const many = Array.from({ length: 5_001 }, (_, i) => ({ id: String(i) }))
    expect(parseVersionParams({ boardId: 'b', message: 'm', snapshot: many })).toHaveProperty('error')
  })
})

describe('parseSpecParams', () => {
  it('accepts a valid spec', () => {
    expect(parseSpecParams({ boardId: 'b', title: 'Spec', markdown: '# Hi' })).toEqual({
      boardId: 'b',
      title: 'Spec',
      markdown: '# Hi',
    })
  })

  it('ignores a client-supplied authorName', () => {
    expect(parseSpecParams({ boardId: 'b', title: 'T', markdown: 'm', authorName: 'Mallory' })).not.toHaveProperty('authorName')
  })

  it('rejects a bad boardId, title or markdown', () => {
    expect(parseSpecParams({ title: 'T', markdown: 'm' })).toHaveProperty('error')
    expect(parseSpecParams({ boardId: 'b', title: '', markdown: 'm' })).toHaveProperty('error')
    expect(parseSpecParams({ boardId: 'b', title: 'x'.repeat(MAX_TITLE_LENGTH + 1), markdown: 'm' })).toHaveProperty('error')
    expect(parseSpecParams({ boardId: 'b', title: 'T', markdown: '' })).toHaveProperty('error')
    expect(parseSpecParams({ boardId: 'b', title: 'T', markdown: ['m'] })).toHaveProperty('error')
    expect(parseSpecParams({ boardId: 'b', title: 'T', markdown: 'x'.repeat(MAX_MARKDOWN_CHARS + 1) })).toHaveProperty('error')
  })
})
