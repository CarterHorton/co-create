import { describe, expect, it, vi } from 'vitest'
import { APP_ID } from '@/constants'
import { callRoomName } from '@/components/call/useCall'
import {
  authorizeLivekitRequest,
  boardCallRoomName,
  isLivekitIntegration,
  parseBoardCallRoom,
  type LivekitRequest,
} from './call-access'

const APP = 'app_01TEST'

describe('parseBoardCallRoom', () => {
  it('accepts exactly <appId>:board:<id>', () => {
    expect(parseBoardCallRoom(`${APP}:board:1731900000000-abc123xyz`, APP)).toBe('1731900000000-abc123xyz')
    expect(parseBoardCallRoom(`${APP}:board:b_1`, APP)).toBe('b_1')
  })

  it('round-trips the builder', () => {
    expect(parseBoardCallRoom(boardCallRoomName(APP, 'abc-1'), APP)).toBe('abc-1')
  })

  it('matches the client room name for the build app id', () => {
    expect(parseBoardCallRoom(callRoomName('abc-1'), APP_ID)).toBe('abc-1')
  })

  it.each([
    ['empty', ''],
    ['no board id', `${APP}:board:`],
    ['other app', `app_OTHER:board:abc`],
    ['app id prefix only', `${APP}X:board:abc`],
    ['missing app', `:board:abc`],
    ['bare board id', 'abc'],
    ['other kind', `${APP}:doc:abc`],
    ['nested segment', `${APP}:board:abc:extra`],
    ['path chars', `${APP}:board:../abc`],
    ['slash', `${APP}:board:a/b`],
    ['whitespace', `${APP}:board:abc `],
    ['leading space', ` ${APP}:board:abc`],
    ['unicode', `${APP}:board:abcé`],
    ['too long', `${APP}:board:${'a'.repeat(129)}`],
    ['case-mismatched kind', `${APP}:BOARD:abc`],
  ])('rejects %s', (_label, room) => {
    expect(parseBoardCallRoom(room, APP)).toBeNull()
  })

  it('rejects non-strings and an empty app id', () => {
    expect(parseBoardCallRoom(undefined, APP)).toBeNull()
    expect(parseBoardCallRoom(42, APP)).toBeNull()
    expect(parseBoardCallRoom({ toString: () => `${APP}:board:a` }, APP)).toBeNull()
    expect(parseBoardCallRoom(':board:abc', '')).toBeNull()
  })
})

describe('isLivekitIntegration', () => {
  it('matches any letter case', () => {
    expect(isLivekitIntegration('livekit')).toBe(true)
    expect(isLivekitIntegration('LiveKit')).toBe(true)
    expect(isLivekitIntegration('google')).toBe(false)
  })
})

describe('authorizeLivekitRequest', () => {
  const base = (over: Partial<LivekitRequest> = {}): LivekitRequest => ({
    appId: APP,
    name: 'livekit',
    endpoint: 'generate-token',
    method: 'POST',
    body: { roomName: `${APP}:board:b1`, displayName: 'Ada' },
    userId: 'u1',
    canAccessBoard: async (id) => id === 'b1',
    ...over,
  })

  it('allows a member and forwards only vetted fields', async () => {
    const access = vi.fn(async () => true)
    const d = await authorizeLivekitRequest(base({ canAccessBoard: access }))
    expect(d).toEqual({
      ok: true,
      boardId: 'b1',
      body: JSON.stringify({ roomName: `${APP}:board:b1`, displayName: 'Ada' }),
    })
    expect(access).toHaveBeenCalledWith('b1')
  })

  it('allows a request without displayName', async () => {
    const d = await authorizeLivekitRequest(base({ body: { roomName: `${APP}:board:b1` } }))
    expect(d).toMatchObject({ ok: true, body: JSON.stringify({ roomName: `${APP}:board:b1` }) })
  })

  it('refuses a caller who cannot open the board', async () => {
    const d = await authorizeLivekitRequest(base({ body: { roomName: `${APP}:board:other` } }))
    expect(d).toEqual({ ok: false, status: 403, error: "You don't have access to this board's call" })
  })

  it('fails closed when the access lookup throws', async () => {
    const d = await authorizeLivekitRequest(
      base({
        canAccessBoard: async () => {
          throw new Error('boom')
        },
      }),
    )
    expect(d).toMatchObject({ ok: false, status: 403 })
  })

  it('requires a signed-in caller', async () => {
    expect(await authorizeLivekitRequest(base({ userId: null }))).toMatchObject({ ok: false, status: 401 })
  })

  it('does not look up access for a malformed room', async () => {
    const access = vi.fn(async () => true)
    const d = await authorizeLivekitRequest(base({ body: { roomName: 'someone-elses-room' }, canAccessBoard: access }))
    expect(d).toMatchObject({ ok: false, status: 403 })
    expect(access).not.toHaveBeenCalled()
  })

  it.each(['create-room', 'delete-room', 'list-rooms', 'settle-room', 'Generate-Token', 'anything'])(
    'refuses endpoint %s',
    async (endpoint) => {
      expect(await authorizeLivekitRequest(base({ endpoint }))).toMatchObject({ ok: false, status: 403 })
    },
  )

  it('refuses a non-canonical integration name and non-POST methods', async () => {
    expect(await authorizeLivekitRequest(base({ name: 'LiveKit' }))).toMatchObject({ ok: false, status: 403 })
    expect(await authorizeLivekitRequest(base({ method: 'GET' }))).toMatchObject({ ok: false, status: 403 })
  })

  it.each([
    ['no body', undefined],
    ['null', null],
    ['array', [`${APP}:board:b1`]],
    ['string', `${APP}:board:b1`],
    ['extra field', { roomName: `${APP}:board:b1`, ttlSeconds: 86400 }],
    ['alternate room field', { room: `${APP}:board:b1` }],
    ['non-string displayName', { roomName: `${APP}:board:b1`, displayName: 5 }],
    ['huge displayName', { roomName: `${APP}:board:b1`, displayName: 'x'.repeat(201) }],
  ])('refuses body: %s', async (_label, body) => {
    expect(await authorizeLivekitRequest(base({ body }))).toMatchObject({ ok: false, status: 403 })
  })
})
