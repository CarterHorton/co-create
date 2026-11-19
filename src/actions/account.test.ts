import { describe, expect, it } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { BOARDS_PER_CALL, runAccountDeletion } from './account'

/**
 * accountDelete against an in-memory record store: every collection the
 * cascade touches, seeded with rows for the deleted user ("me") and for two
 * other people, so the test proves both what goes and what stays.
 */

type Rec = { recordId: string; createdBy: string; data: Record<string, unknown> }

function fakeStore() {
  const db = new Map<string, Rec[]>()
  let n = 0
  const rows = (c: string) => db.get(c) ?? (db.set(c, []), db.get(c)!)
  const matches = (r: Rec, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) =>
      k === 'recordId' ? r.recordId === v : k === 'createdBy' ? r.createdBy === v : r.data[k] === v,
    )
  const add = (c: string, data: Record<string, unknown>, createdBy: string, recordId = `${c}-${++n}`) => {
    rows(c).push({ recordId, createdBy, data })
    return recordId
  }
  const tools = {
    async query(c: string, { where, limit }: { where: Record<string, unknown>; limit: number }) {
      return { success: true, data: { records: rows(c).filter((r) => matches(r, where)).slice(0, limit) } }
    },
    async get(c: string, id: string) {
      const r = rows(c).find((x) => x.recordId === id)
      return r ? { success: true, data: { record: r } } : { success: false, error: 'Record not found' }
    },
    async update(c: string, id: string, data: Record<string, unknown>) {
      const r = rows(c).find((x) => x.recordId === id)
      if (!r) return { success: false, error: 'Record not found' }
      Object.assign(r.data, data)
      return { success: true, data: {} }
    },
    async remove(c: string, id: string) {
      const before = rows(c).length
      db.set(c, rows(c).filter((x) => x.recordId !== id))
      return before === rows(c).length ? { success: false, error: 'Record not found' } : { success: true, data: {} }
    },
    async deleteWhere(c: string, where: Record<string, unknown>, limit = 100) {
      const hit = rows(c).filter((r) => matches(r, where)).slice(0, limit)
      db.set(c, rows(c).filter((r) => !hit.includes(r)))
      return { success: true, data: { deleted: hit.length } }
    },
  } as unknown as ActionTools
  const cleared: string[] = []
  const room = (onFetch?: (name: string) => void) => ({
    idFromName: (name: string) => name,
    get: (name: string) => ({
      fetch: async () => {
        onFetch?.(name)
        return new Response('{}')
      },
    }),
  })
  const env = { CANVAS_ROOMS: room((name) => cleared.push(name)), PRESENCE_ROOMS: room() } as unknown as Env
  const ids = (c: string) => rows(c).map((r) => r.recordId)
  return { add, tools, env, rows, ids, cleared }
}

async function runToCompletion(s: ReturnType<typeof fakeStore>, userId: string) {
  for (let i = 0; i < 50; i++) {
    if ((await runAccountDeletion({ tools: s.tools, env: s.env, userId })).done) return i + 1
  }
  throw new Error('never finished')
}

describe('accountDelete', () => {
  it('removes everything the user owns or created and leaves other people alone', async () => {
    const s = fakeStore()
    const me = 'me'
    const amy = 'amy'
    const bo = 'bo'
    s.add('users', { name: 'Me' }, me, me)
    s.add('users', { name: 'Amy' }, amy, amy)

    // My board, shared with Amy, with content from both of us.
    const mine = s.add('boards', { ownerId: me }, me)
    s.add('team_members', { teamId: mine, userId: me }, me)
    s.add('team_members', { teamId: mine, userId: amy }, me)
    s.add('versions', { boardId: mine }, amy)
    s.add('comments', { boardId: mine, authorId: amy }, amy)
    s.add('votes', { boardId: mine, userId: amy, panelId: 'x' }, amy)
    s.add('board_links', { boardId: mine, ownerId: me }, me)

    // Amy's board that I can edit.
    const amys = s.add('boards', { ownerId: amy, accessVersion: 1 }, amy)
    s.add('team_members', { teamId: amys, userId: amy }, amy)
    s.add('team_members', { teamId: amys, userId: me }, amy)
    const myRoot = s.add('comments', { boardId: amys, authorId: me }, me)
    s.add('comments', { boardId: amys, authorId: amy, parentId: myRoot }, amy)
    const amyRoot = s.add('comments', { boardId: amys, authorId: amy }, amy)
    const myReply = s.add('comments', { boardId: amys, authorId: me, parentId: amyRoot }, me)
    s.add('mentions', { boardId: amys, userId: amy, commentId: myReply, threadId: amyRoot }, me)
    s.add('mentions', { boardId: amys, userId: me, commentId: amyRoot, threadId: amyRoot }, amy)
    const myPanel = s.add('vote_panels', { boardId: amys, openedBy: me }, me)
    s.add('votes', { boardId: amys, panelId: myPanel, userId: amy }, amy)
    const amyPanel = s.add('vote_panels', { boardId: amys, openedBy: amy }, amy)
    s.add('votes', { boardId: amys, panelId: amyPanel, userId: me }, me)
    s.add('votes', { boardId: amys, panelId: amyPanel, userId: amy }, amy)
    s.add('versions', { boardId: amys }, me)
    s.add('versions', { boardId: amys }, amy)
    s.add('specs', { boardId: amys }, me)

    // Projects, pins, friends, codes.
    const proj = s.add('projects', { ownerId: me }, me)
    s.add('project_members', { projectId: proj, ownerId: me, userId: amy }, me)
    s.add('project_grants', { projectId: proj, boardId: mine, userId: amy }, me)
    const amyProj = s.add('projects', { ownerId: amy }, amy)
    s.add('project_members', { projectId: amyProj, ownerId: amy, userId: me }, amy)
    s.add('project_grants', { projectId: amyProj, boardId: amys, userId: me }, amy)
    s.add('board_pins', { ownerId: me, boardId: amys }, me)
    s.add('board_pins', { ownerId: amy, boardId: amys }, amy)
    s.add('friendships', { ownerId: me, friendId: amy }, me)
    s.add('friendships', { ownerId: amy, friendId: me }, amy)
    s.add('friendships', { ownerId: amy, friendId: bo }, amy)
    s.add('friend_codes', { ownerId: me }, me)
    s.add('friend_code_attempts', { userId: me }, me)
    s.add('board_link_attempts', { userId: me }, me)

    await runToCompletion(s, me)

    expect(s.ids('users')).toEqual([amy])
    expect(s.ids('boards')).toEqual([amys])
    expect(s.cleared).toEqual([mine])
    expect(s.rows('team_members').map((r) => r.data.userId)).toEqual([amy])
    // My thread went with its replies; Amy's thread stays without my reply.
    expect(s.ids('comments')).toEqual([amyRoot])
    expect(s.rows('mentions')).toEqual([])
    expect(s.rows('vote_panels').map((r) => r.data.openedBy)).toEqual([amy])
    expect(s.rows('votes').map((r) => [r.data.panelId, r.data.userId])).toEqual([[amyPanel, amy]])
    expect(s.rows('versions').map((r) => r.createdBy)).toEqual([amy])
    expect(s.rows('specs')).toEqual([])
    expect(s.ids('projects')).toEqual([amyProj])
    expect(s.rows('project_members')).toEqual([])
    expect(s.rows('project_grants')).toEqual([])
    expect(s.rows('board_pins').map((r) => r.data.ownerId)).toEqual([amy])
    expect(s.rows('friendships').map((r) => r.data.friendId)).toEqual([bo])
    expect(s.rows('friend_codes')).toEqual([])
    expect(s.rows('friend_code_attempts')).toEqual([])
    expect(s.rows('board_link_attempts')).toEqual([])
    expect(s.rows('board_links')).toEqual([])
    // Amy's board was re-saved so open board lists drop it for me.
    expect(s.rows('boards')[0].data.accessVersion).toBe(2)
  })

  it('works through many boards over several calls and keeps the profile until the end', async () => {
    const s = fakeStore()
    s.add('users', { name: 'Me' }, 'me', 'me')
    for (let i = 0; i < BOARDS_PER_CALL * 2 + 1; i++) s.add('boards', { ownerId: 'me' }, 'me')

    const first = await runAccountDeletion({ tools: s.tools, env: s.env, userId: 'me' })
    expect(first.done).toBe(false)
    expect(s.ids('users')).toEqual(['me'])

    const calls = await runToCompletion(s, 'me')
    expect(calls).toBeGreaterThan(1)
    expect(s.rows('boards')).toEqual([])
    expect(s.rows('users')).toEqual([])
  })

  it('is safe to run again after it has finished', async () => {
    const s = fakeStore()
    s.add('users', { name: 'Amy' }, 'amy', 'amy')
    await runToCompletion(s, 'me')
    expect(await runAccountDeletion({ tools: s.tools, env: s.env, userId: 'me' })).toEqual({ done: true })
    expect(s.ids('users')).toEqual(['amy'])
  })
})
