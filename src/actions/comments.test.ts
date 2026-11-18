/**
 * Access rules of the comment actions, against an in-memory stand-in for the
 * record tools (actions run RBAC-off, so these checks are the only ones).
 */
import { describe, expect, it } from 'vitest'
import type { ActionResult, ActionTools } from 'deepspace/worker'
import { commentActions } from './comments'

type Row = { recordId: string; createdBy: string; createdAt: string; data: Record<string, unknown> }

function fakeTools(seed: Record<string, Record<string, Record<string, unknown>>>, as: { userId: string }) {
  const db = new Map<string, Map<string, Row>>()
  let n = 0
  const table = (c: string) => {
    if (!db.has(c)) db.set(c, new Map())
    return db.get(c)!
  }
  for (const [c, rows] of Object.entries(seed)) {
    for (const [id, data] of Object.entries(rows)) table(c).set(id, { recordId: id, createdBy: 'seed', createdAt: '', data })
  }
  const matches = (r: Row, where: Record<string, unknown> = {}) => Object.entries(where).every(([k, v]) => r.data[k] === v)
  const ok = <T,>(data: T): ActionResult<T> => ({ success: true, data }) as ActionResult<T>
  const tools = {
    async create(c: string, data: Record<string, unknown>) {
      const id = `${c}-${++n}`
      table(c).set(id, { recordId: id, createdBy: as.userId, createdAt: String(n).padStart(4, '0'), data: { ...data } })
      return ok({ recordId: id })
    },
    async update(c: string, id: string, data: Record<string, unknown>) {
      const r = table(c).get(id)
      if (!r) return { success: false, error: 'not found' }
      Object.assign(r.data, data)
      return ok({ recordId: id })
    },
    async remove(c: string, id: string) {
      table(c).delete(id)
      return ok({ recordId: id })
    },
    async deleteWhere(c: string, where: Record<string, unknown>) {
      let deleted = 0
      for (const [id, r] of table(c)) if (matches(r, where)) (table(c).delete(id), deleted++)
      return ok({ deleted })
    },
    async get(c: string, id: string) {
      const r = table(c).get(id)
      return r ? ok({ record: r }) : { success: false, error: 'not found' }
    },
    async query(c: string, opts: { where?: Record<string, unknown> } = {}) {
      const records = [...table(c).values()].filter((r) => matches(r, opts.where))
      return ok({ records, count: records.length })
    },
  } as unknown as ActionTools
  return { tools, table }
}

const seed = () => ({
  users: { owner: { name: 'Olive' }, ed: { name: 'Ed' }, vi: { name: 'Vi', role: 'viewer' }, out: { name: 'Out' } },
  boards: { b1: { title: 'Plan', ownerId: 'owner' } },
  team_members: {
    t1: { teamId: 'b1', userId: 'owner', status: 'active', name: 'Olive', role: 'owner' },
    t2: { teamId: 'b1', userId: 'ed', status: 'active', name: 'Ed', role: 'editor' },
    t3: { teamId: 'b1', userId: 'vi', status: 'active', name: 'Vi', role: 'editor' },
  },
})

function setup() {
  const as = { userId: 'owner' }
  const { tools, table } = fakeTools(seed(), as)
  const call = async (userId: string, name: keyof typeof commentActions, params: Record<string, unknown>) => {
    as.userId = userId
    return commentActions[name]({ userId, params, tools } as never) as Promise<ActionResult & { data?: Record<string, unknown> }>
  }
  return { call, table }
}

describe('comment actions', () => {
  it('lets anyone on the board comment (viewers too) and nobody else', async () => {
    const { call } = setup()
    expect((await call('vi', 'commentCreate', { boardId: 'b1', body: 'hi' })).success).toBe(true)
    expect((await call('ed', 'commentCreate', { boardId: 'b1', shapeId: 's1', body: 'hi' })).success).toBe(true)
    const out = await call('out', 'commentCreate', { boardId: 'b1', body: 'hi' })
    expect(out).toMatchObject({ success: false, code: 'forbidden' })
    expect(await call('ed', 'commentCreate', { boardId: 'nope', body: 'hi' })).toMatchObject({ code: 'forbidden' })
  })

  it('stamps the author from the server, not params', async () => {
    const { call, table } = setup()
    const res = await call('ed', 'commentCreate', { boardId: 'b1', body: 'hi', authorId: 'owner', authorName: 'Olive' })
    const row = table('comments').get(res.data!.recordId as string)!
    expect(row.data).toMatchObject({ authorId: 'ed', authorName: 'Ed' })
  })

  it('notifies mentioned members only (not yourself, not outsiders)', async () => {
    const { call, table } = setup()
    const res = await call('ed', 'commentCreate', { boardId: 'b1', body: '@Olive @Ed @Out @Vi look' })
    expect(res.data!.mentions).toEqual(['owner', 'vi'])
    const notes = [...table('mentions').values()].map((r) => r.data)
    expect(notes.map((x) => x.userId).sort()).toEqual(['owner', 'vi'])
    expect(notes[0]).toMatchObject({ boardId: 'b1', threadId: res.data!.recordId, actorName: 'Ed', read: false })
  })

  it('keeps replies one level deep and on the same board', async () => {
    const { call, table } = setup()
    const root = (await call('ed', 'commentCreate', { boardId: 'b1', shapeId: 's1', shapeLabel: 'Sticky', body: 'q' })).data!
      .recordId as string
    const reply = await call('vi', 'commentCreate', { boardId: 'b1', parentId: root, body: 'a' })
    expect(table('comments').get(reply.data!.recordId as string)!.data).toMatchObject({ shapeId: 's1', parentId: root })
    expect(await call('vi', 'commentCreate', { boardId: 'b1', parentId: reply.data!.recordId, body: 'x' })).toMatchObject({
      success: false,
    })
  })

  it('lets only the author edit, and notifies only newly mentioned people', async () => {
    const { call, table } = setup()
    const id = (await call('ed', 'commentCreate', { boardId: 'b1', body: '@Vi hi' })).data!.recordId as string
    expect(await call('owner', 'commentEdit', { commentId: id, body: 'x' })).toMatchObject({ code: 'forbidden' })
    expect((await call('ed', 'commentEdit', { commentId: id, body: '@Vi @Olive hi' })).success).toBe(true)
    expect(table('comments').get(id)!.data.editedAt).toBeTruthy()
    expect([...table('mentions').values()].map((r) => r.data.userId).sort()).toEqual(['owner', 'vi'])
  })

  it('lets the author or the owner delete; a thread takes its replies and notifications', async () => {
    const { call, table } = setup()
    const root = (await call('ed', 'commentCreate', { boardId: 'b1', body: 'q @Vi' })).data!.recordId as string
    await call('vi', 'commentCreate', { boardId: 'b1', parentId: root, body: 'a' })
    expect(await call('vi', 'commentDelete', { commentId: root })).toMatchObject({ code: 'forbidden' })
    expect((await call('owner', 'commentDelete', { commentId: root })).success).toBe(true)
    expect(table('comments').size).toBe(0)
    expect(table('mentions').size).toBe(0)
  })

  it('lets the thread author or owner resolve, not others or replies', async () => {
    const { call, table } = setup()
    const root = (await call('ed', 'commentCreate', { boardId: 'b1', body: 'q' })).data!.recordId as string
    const reply = (await call('vi', 'commentCreate', { boardId: 'b1', parentId: root, body: 'a' })).data!.recordId
    expect(await call('vi', 'commentResolve', { commentId: root, resolved: true })).toMatchObject({ code: 'forbidden' })
    expect(await call('vi', 'commentResolve', { commentId: reply, resolved: true })).toMatchObject({ success: false })
    expect((await call('ed', 'commentResolve', { commentId: root, resolved: true })).success).toBe(true)
    expect(table('comments').get(root)!.data.resolved).toBe(true)
    expect((await call('owner', 'commentResolve', { commentId: root, resolved: false })).success).toBe(true)
  })

  it('hides comments on boards you cannot open', async () => {
    const { call } = setup()
    const id = (await call('ed', 'commentCreate', { boardId: 'b1', body: 'q' })).data!.recordId
    expect(await call('out', 'commentDelete', { commentId: id })).toMatchObject({ code: 'not_found' })
    expect(await call('out', 'commentEdit', { commentId: id, body: 'x' })).toMatchObject({ code: 'not_found' })
  })

  it('marks only your own mentions read', async () => {
    const { call, table } = setup()
    const thread = (await call('ed', 'commentCreate', { boardId: 'b1', body: '@Vi @Olive' })).data!.recordId
    const [forVi, forOwner] = [...table('mentions').values()].sort((a, b) => String(a.data.userId).localeCompare(String(b.data.userId))).reverse()
    expect(await call('vi', 'mentionsMarkRead', { ids: [forVi.recordId, forOwner.recordId] })).toMatchObject({ data: { marked: 1 } })
    expect(forOwner.data.read).toBe(false)
    expect(await call('owner', 'mentionsMarkRead', { threadId: thread })).toMatchObject({ data: { marked: 1 } })
    expect(forOwner.data.read).toBe(true)
  })
})
