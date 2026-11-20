import { describe, expect, it } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import { DAILY_CAP, appOrigin, isSuppressed, renderNotice, sendNotice, type Notice } from './notify'
import { unsubscribeByToken } from '../actions/email'
import { browserMayCall } from '../integrations'

type Rec = { recordId: string; data: Record<string, unknown> }

/** In-memory record store plus a recorder for `email/send` calls. */
function fake(opts: { sendFails?: boolean } = {}) {
  const db = new Map<string, Rec[]>()
  let n = 0
  const rows = (c: string) => db.get(c) ?? (db.set(c, []), db.get(c)!)
  const matches = (r: Rec, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => r.data[k] === v)
  const sent: Record<string, unknown>[] = []
  const tools = {
    async query(c: string, { where, limit }: { where: Record<string, unknown>; limit: number }) {
      return { success: true, data: { records: rows(c).filter((r) => matches(r, where)).slice(0, limit) } }
    },
    async get(c: string, id: string) {
      const r = rows(c).find((x) => x.recordId === id)
      return r ? { success: true, data: { record: r } } : { success: false, error: 'Record not found' }
    },
    async create(c: string, data: Record<string, unknown>, id?: string) {
      const recordId = id ?? `${c}-${++n}`
      rows(c).push({ recordId, data })
      return { success: true, data: { recordId } }
    },
    async remove(c: string, id: string) {
      db.set(c, rows(c).filter((x) => x.recordId !== id))
      return { success: true, data: {} }
    },
    async deleteWhere(c: string, where: Record<string, unknown>) {
      const before = rows(c).length
      db.set(c, rows(c).filter((r) => !matches(r, where)))
      return { success: true, data: { deleted: before - rows(c).length } }
    },
    async integration(endpoint: string, data: Record<string, unknown>) {
      if (opts.sendFails) return { success: false, error: 'insufficient_credits' }
      sent.push({ endpoint, ...data })
      return { success: true, data: {} }
    },
  } as unknown as ActionTools
  const addUser = (id: string, email?: string, name = id) => rows('users').push({ recordId: id, data: { email, name } })
  return { tools, rows, sent, addUser }
}

const board: Notice = { kind: 'board', fromName: 'Amy', boardTitle: 'Launch plan', boardId: 'b1' }
const origin = 'https://co-create.app.space'

describe('renderNotice', () => {
  it('names who did what, links to the board, and ends with an unsubscribe link', () => {
    const e = renderNotice(board, origin, 'tok_en')
    expect(e.subject).toBe('Amy shared “Launch plan” with you')
    expect(e.text).toContain(`${origin}/board/b1`)
    expect(e.text).toContain(`Unsubscribe: ${origin}/unsubscribe?t=tok_en`)
    expect(e.html).toContain(`href="${origin}/unsubscribe?t=tok_en"`)
  })

  it('escapes names and titles in the HTML and keeps them to one line', () => {
    const e = renderNotice(
      { kind: 'board', fromName: 'Eve <script>', boardTitle: 'a\n"b" & <i>c</i>', boardId: 'x' },
      origin,
      't',
    )
    expect(e.html).not.toContain('<script>')
    expect(e.html).toContain('Eve &lt;script&gt;')
    expect(e.subject).not.toContain('\n')
  })

  it('writes friend and project notices', () => {
    expect(renderNotice({ kind: 'friend', fromName: 'Bo' }, origin, 't').subject).toBe('Bo added you as a friend on Co-Create')
    expect(renderNotice({ kind: 'project', fromName: 'Bo', projectName: 'Q3', boards: 2 }, origin, 't').text).toContain(
      '“Q3” (2 boards)',
    )
  })
})

describe('sendNotice', () => {
  it('sends to the recipient with a stable unsubscribe token', async () => {
    const f = fake()
    f.addUser('bob', 'bob@mail.com')
    expect(await sendNotice(f.tools, { senderId: 'amy', recipientId: 'bob', origin, notice: board })).toBe('sent')
    expect(await sendNotice(f.tools, { senderId: 'amy', recipientId: 'bob', origin, notice: board })).toBe('sent')
    expect(f.sent).toHaveLength(2)
    expect(f.sent[0]).toMatchObject({ endpoint: 'email/send', to: 'bob@mail.com' })
    expect(f.rows('email_prefs')).toHaveLength(1)
    const token = f.rows('email_prefs')[0].data.token as string
    expect(f.sent[1].text).toContain(`t=${token}`)
  })

  it('skips people without an address and reserved test domains, without spending anything', async () => {
    const f = fake()
    f.addUser('none')
    f.addUser('tester', 'cocreate-alice@deepspace.test')
    expect(await sendNotice(f.tools, { senderId: 'a', recipientId: 'none', origin, notice: board })).toBe('no_email')
    expect(await sendNotice(f.tools, { senderId: 'a', recipientId: 'tester', origin, notice: board })).toBe('undeliverable')
    expect(f.sent).toHaveLength(0)
  })

  it('never emails someone on the no-email list', async () => {
    const f = fake()
    f.addUser('bob', 'Bob@Mail.com')
    await sendNotice(f.tools, { senderId: 'amy', recipientId: 'bob', origin, notice: board })
    const token = f.rows('email_prefs')[0].data.token
    expect((await unsubscribeByToken(f.tools, token)).success).toBe(true)
    expect(await isSuppressed(f.tools, ' bob@mail.COM ')).toBe(true)
    expect(f.rows('email_suppressions')[0].data.emailHash).not.toContain('bob')
    expect(await sendNotice(f.tools, { senderId: 'amy', recipientId: 'bob', origin, notice: board })).toBe('unsubscribed')
    expect(f.sent).toHaveLength(1)
  })

  it('caps how many emails one person can cause in a day', async () => {
    const f = fake()
    f.addUser('bob', 'bob@mail.com')
    const now = 1_000_000_000
    for (let i = 0; i < DAILY_CAP; i++) {
      expect(await sendNotice(f.tools, { senderId: 'amy', recipientId: 'bob', origin, notice: board, now })).toBe('sent')
    }
    expect(await sendNotice(f.tools, { senderId: 'amy', recipientId: 'bob', origin, notice: board, now })).toBe('capped')
    // Someone else isn't held back by Amy's cap, and Amy can send again a day later.
    expect(await sendNotice(f.tools, { senderId: 'cy', recipientId: 'bob', origin, notice: board, now })).toBe('sent')
    const later = now + 24 * 60 * 60_000 + 1
    expect(await sendNotice(f.tools, { senderId: 'amy', recipientId: 'bob', origin, notice: board, now: later })).toBe('sent')
  })

  it('reports a failed send instead of throwing, so the share still succeeds', async () => {
    const f = fake({ sendFails: true })
    f.addUser('bob', 'bob@mail.com')
    expect(await sendNotice(f.tools, { senderId: 'amy', recipientId: 'bob', origin, notice: board })).toBe('failed')
  })
})

describe('unsubscribeByToken', () => {
  it('refuses malformed and unknown tokens', async () => {
    const f = fake()
    expect((await unsubscribeByToken(f.tools, 'nope')).success).toBe(false)
    expect((await unsubscribeByToken(f.tools, 'A'.repeat(22))).success).toBe(false)
    expect(f.rows('email_suppressions')).toHaveLength(0)
  })
})

describe('appOrigin', () => {
  it('uses the request origin, else the deployed address', () => {
    expect(appOrigin({ REQUEST_ORIGIN: 'http://localhost:5174', APP_NAME: 'co-create' })).toBe('http://localhost:5174')
    expect(appOrigin({ APP_NAME: 'co-create' })).toBe('https://co-create.app.space')
  })
})

describe('browserMayCall', () => {
  it('lets the browser reach only integrations it may: never ones the app owner pays for', () => {
    expect(browserMayCall('livekit')).toBe(true)
    expect(browserMayCall('email')).toBe(false)
    expect(browserMayCall('anthropic')).toBe(false) // unlisted: the owner would pay
    expect(browserMayCall('constructor')).toBe(false)
  })
})
