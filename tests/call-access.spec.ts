/**
 * Board call tokens are gated on board access in the worker
 * (src/server/call-access.ts). A signed-in user who is not on a board must
 * not be able to mint a LiveKit token for its call, nor reach the other
 * livekit endpoints through the integrations proxy.
 *
 * Run: npx deepspace test run tests/call-access.spec.ts
 */
import { fileURLToPath } from 'node:url'
import { resolveAppId } from 'deepspace/build'
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

/** The app id the dev bundle and worker run with — same resolution as vite.config.ts. */
const APP_ID = resolveAppId({ appDir: fileURLToPath(new URL('..', import.meta.url)) })

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts — see collab.spec.ts.')

/** POST to the integrations proxy from the page, with the session's JWT, as the SDK client does. */
async function postIntegration(
  page: Page,
  endpoint: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  return page.evaluate(
    async ({ endpoint, body }) => {
      const t = await fetch('/api/auth/token', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      const { token } = (await t.json()) as { token?: string }
      const res = await fetch(`/api/integrations/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      })
      let json: Record<string, unknown> | null = null
      try {
        json = (await res.json()) as Record<string, unknown>
      } catch {
        json = null
      }
      return { status: res.status, json }
    },
    { endpoint, body },
  )
}

test('call tokens require access to the board', async ({ users }) => {
  test.setTimeout(60_000)
  const [a, b] = await users(2)

  await a.page.goto('/home')
  await a.page.getByTestId('board-title-input').fill(`Call access ${Date.now()}`)
  await a.page.getByTestId('board-create').click()
  await expect(a.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
  const boardId = new URL(a.page.url()).pathname.split('/').pop() ?? ''
  expect(boardId).not.toBe('')

  const room = `${APP_ID}:board:${boardId}`

  // The owner gets a token for their board's room (the client's exact shape).
  const owner = await postIntegration(a.page, 'livekit/generate-token', { roomName: room, displayName: 'Owner' })
  expect(owner.status).toBe(200)

  // B is signed in but not on A's board → refused with the client's message.
  await b.page.goto('/home')
  await expect(b.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 })
  const stranger = await postIntegration(b.page, 'livekit/generate-token', { roomName: room })
  expect(stranger.status).toBe(403)
  expect(stranger.json?.error).toBe("You don't have access to this board's call")

  // Room names that are not exactly this app's board room → refused even for the owner.
  for (const roomName of [boardId, `other_app:board:${boardId}`, `${room}:x`]) {
    const res = await postIntegration(a.page, 'livekit/generate-token', { roomName })
    expect(res.status, roomName).toBe(403)
  }
  // Unknown body fields are refused rather than forwarded.
  const extra = await postIntegration(a.page, 'livekit/generate-token', { roomName: room, ttlSeconds: 86400 })
  expect(extra.status).toBe(403)

  // Other livekit endpoints are closed (admin token, delete, list).
  for (const endpoint of ['livekit/create-room', 'livekit/delete-room', 'livekit/list-rooms']) {
    const res = await postIntegration(a.page, endpoint, { roomName: room })
    expect(res.status, endpoint).toBe(403)
  }
})
