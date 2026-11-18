import { describe, expect, it } from 'vitest'
import {
  MAX_BODY_LENGTH,
  MAX_MENTIONS,
  findMentions,
  groupThreads,
  insertMention,
  mentionQuery,
  openCounts,
  parseCommentParams,
  parseEditParams,
  splitMentions,
  suggestMembers,
  type CommentRow,
  type Member,
} from './model'

const members: Member[] = [
  { userId: 'u1', name: 'Ann' },
  { userId: 'u2', name: 'Ann Lee' },
  { userId: 'u3', name: 'Bob' },
  { userId: 'u4', name: 'carter@example.com' },
]

describe('parseCommentParams', () => {
  it('accepts a board comment and a shape comment, trimming the body', () => {
    expect(parseCommentParams({ boardId: 'b1', body: '  hi  ' })).toEqual({ boardId: 'b1', shapeId: null, parentId: null, body: 'hi' })
    expect(parseCommentParams({ boardId: 'b1', shapeId: 's1', parentId: '', body: 'x' })).toEqual({
      boardId: 'b1',
      shapeId: 's1',
      parentId: null,
      body: 'x',
    })
  })

  it('rejects missing ids and bad bodies', () => {
    for (const boardId of [undefined, '', ' ', 7, 'x'.repeat(201)]) {
      expect(parseCommentParams({ boardId, body: 'hi' })).toHaveProperty('error')
    }
    for (const body of [undefined, '', '   ', 42, 'x'.repeat(MAX_BODY_LENGTH + 1)]) {
      expect(parseCommentParams({ boardId: 'b', body })).toHaveProperty('error')
    }
    expect(parseCommentParams({ boardId: 'b', body: 'x'.repeat(MAX_BODY_LENGTH) })).not.toHaveProperty('error')
    expect(parseCommentParams({ boardId: 'b', shapeId: 12, body: 'x' })).toHaveProperty('error')
    expect(parseCommentParams({ boardId: 'b', parentId: { id: 1 }, body: 'x' })).toHaveProperty('error')
  })
})

describe('parseEditParams', () => {
  it('needs a comment id and a body', () => {
    expect(parseEditParams({ commentId: 'c', body: ' new ' })).toEqual({ commentId: 'c', body: 'new' })
    expect(parseEditParams({ body: 'x' })).toHaveProperty('error')
    expect(parseEditParams({ commentId: 'c', body: '' })).toHaveProperty('error')
  })
})

describe('findMentions / splitMentions', () => {
  it('prefers the longest matching name', () => {
    expect(findMentions('hey @Ann Lee, look', members)).toEqual(['u2'])
    expect(findMentions('hey @Ann, look', members)).toEqual(['u1'])
  })

  it('is case-insensitive, de-duplicates and needs a word boundary after the name', () => {
    expect(findMentions('@bob and @BOB', members)).toEqual(['u3'])
    expect(findMentions('@Bobby', members)).toEqual([])
    expect(findMentions('@Bob.', members)).toEqual(['u3'])
  })

  it('ignores @ inside words such as email addresses', () => {
    expect(findMentions('mail bob@Ann.com', members)).toEqual([])
    expect(findMentions('ping @carter@example.com please', members)).toEqual(['u4'])
  })

  it('ignores non-members and caps the count', () => {
    expect(findMentions('@Zed', members)).toEqual([])
    const many = Array.from({ length: MAX_MENTIONS + 5 }, (_, i) => ({ userId: `m${i}`, name: `Person${i}` }))
    expect(findMentions(many.map((m) => `@${m.name}`).join(' '), many)).toHaveLength(MAX_MENTIONS)
  })

  it('splits text into plain and mention segments', () => {
    expect(splitMentions('hi @Ann Lee!', members)).toEqual([
      { text: 'hi ' },
      { text: '@Ann Lee', userId: 'u2' },
      { text: '!' },
    ])
    expect(splitMentions('no mentions', members)).toEqual([{ text: 'no mentions' }])
  })
})

describe('mentionQuery / suggestMembers / insertMention', () => {
  it('finds the mention being typed at the caret', () => {
    expect(mentionQuery('hi @An', 6)).toEqual({ start: 3, query: 'An' })
    expect(mentionQuery('hi @Ann L', 9)).toEqual({ start: 3, query: 'Ann L' })
    expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' })
    expect(mentionQuery('a@b', 3)).toBeNull()
    expect(mentionQuery('hi @Ann\nx', 9)).toBeNull()
    expect(mentionQuery('hi there', 8)).toBeNull()
  })

  it('suggests prefix matches first and skips yourself', () => {
    expect(suggestMembers(members, 'ann').map((m) => m.userId)).toEqual(['u1', 'u2'])
    expect(suggestMembers(members, 'lee').map((m) => m.userId)).toEqual(['u2'])
    expect(suggestMembers(members, '', 'u3').map((m) => m.userId)).not.toContain('u3')
  })

  it('replaces the query with the name and moves the caret after it', () => {
    expect(insertMention('hi @An there', 3, 6, 'Ann Lee')).toEqual({ text: 'hi @Ann Lee  there', caret: 12 })
  })
})

describe('groupThreads / openCounts', () => {
  const row = (id: string, at: string, extra: Partial<CommentRow> = {}): CommentRow => ({
    id,
    boardId: 'b',
    shapeId: 's1',
    parentId: null,
    authorId: 'u1',
    authorName: 'Ann',
    body: id,
    mentions: [],
    resolved: false,
    createdAt: at,
    editedAt: null,
    ...extra,
  })

  it('groups replies under roots, oldest first, dropping orphans', () => {
    const threads = groupThreads([
      row('r2', '2026-01-03'),
      row('a', '2026-01-02', { parentId: 'r1' }),
      row('r1', '2026-01-01'),
      row('orphan', '2026-01-04', { parentId: 'gone' }),
    ])
    expect(threads.map((t) => t.root.id)).toEqual(['r1', 'r2'])
    expect(threads[0].replies.map((r) => r.id)).toEqual(['a'])
  })

  it('counts comments in open threads per shape', () => {
    const threads = groupThreads([
      row('r1', '1'),
      row('a', '2', { parentId: 'r1' }),
      row('r2', '3', { resolved: true }),
      row('r3', '4', { shapeId: null }),
      row('r4', '5', { shapeId: 's2' }),
    ])
    expect([...openCounts(threads)]).toEqual([
      ['s1', 2],
      ['s2', 1],
    ])
  })
})
