/**
 * View-only share links: the owner creates a /join/<token> link, someone who
 * is not on the board opens it and gets a genuinely read-only board (client
 * AND server), and revoking the link can also take their access away.
 *
 * Works on a fresh board, so it neither needs nor changes the two accounts'
 * friendship or anything other specs rely on.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'

const usableTestAccounts = loadAllTestAccounts().length
test.skip(usableTestAccounts < 2, `Needs 2 usable test accounts, found ${usableTestAccounts}.`)

async function addStickyByKeyboard(page: Page, text: string) {
  await page.getByTestId('board-viewport').focus()
  await page.keyboard.press('n')
  await expect(page.getByTestId('tool-sticky')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('shape-editor')).toBeFocused()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('shape-editor')).toHaveCount(0)
}

/**
 * Talk to the board's CanvasRoom directly, bypassing the UI: report the
 * `canWrite` the server grants and whether a raw `canvas.add` is refused.
 */
async function rawCanvasWrite(page: Page, boardId: string) {
  return page.evaluate(async (id) => {
    const tokenRes = await fetch('/api/auth/token', { method: 'POST', credentials: 'include' })
    const { token } = (await tokenRes.json()) as { token: string }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${location.host}/ws/canvas/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`)
    return await new Promise<{ canWrite: boolean | null; error: string | null }>((resolve) => {
      let canWrite: boolean | null = null
      const done = (error: string | null) => {
        ws.close()
        resolve({ canWrite, error })
      }
      const timer = setTimeout(() => done(null), 5_000)
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as { type: string; payload: Record<string, unknown> }
        if (msg.type === 'auth') {
          canWrite = msg.payload.canWrite as boolean
          ws.send(
            JSON.stringify({
              type: 'canvas.add',
              payload: { id: `hack-${Date.now()}`, type: 'sticky', x: 0, y: 0, width: 160, height: 120, props: { text: 'sneaky' } },
            }),
          )
        } else if (msg.type === 'core.error') {
          clearTimeout(timer)
          done(String(msg.payload.error))
        }
      }
      ws.onerror = () => {
        clearTimeout(timer)
        done('socket error')
      }
    })
  }, boardId)
}

test('a view-only link gives a read-only board, and revoking can remove its viewers', async ({ users }) => {
  test.setTimeout(150_000)
  const [a, b] = await users(2)

  // A makes a board with one note.
  await a.page.goto('/home')
  await expect(a.page.getByTestId('boards-page')).toBeVisible({ timeout: 15_000 })
  const title = `Link share ${Date.now()}`
  await a.page.getByTestId('board-title-input').fill(title)
  await a.page.getByTestId('board-create').click()
  await a.page.waitForURL(/\/board\//)
  await expect(a.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
  const boardUrl = a.page.url()
  const boardId = boardUrl.split('/board/')[1]
  await expect(a.page.getByTestId('tool-sticky')).toBeEnabled({ timeout: 15_000 })
  await addStickyByKeyboard(a.page, 'Owner note')
  await expect(a.page.getByTestId('shape-sticky')).toHaveCount(1)

  // A creates a 7-day view-only link; the full URL is shown once.
  await a.page.getByTestId('share-open').click()
  const menu = a.page.getByTestId('share-menu')
  await menu.getByTestId('share-link-expiry').click()
  await a.page.getByRole('option', { name: 'In 7 days' }).click()
  await menu.getByTestId('share-link-create').click()
  const urlField = menu.getByTestId('share-link-url')
  await expect(urlField).toHaveValue(/\/join\/[A-Za-z0-9_-]{22}$/, { timeout: 15_000 })
  const joinUrl = await urlField.inputValue()
  const joinPath = new URL(joinUrl).pathname
  await expect(menu.getByTestId('share-link-list').locator('li')).toHaveCount(1, { timeout: 15_000 })
  await expect(menu.getByTestId('share-link-list')).toContainText('Expires')
  await expect(menu.getByTestId('share-link-list')).toContainText('0 viewers joined')
  await a.page.keyboard.press('Escape')

  // A bad token shows a clear error page, not a crash.
  await b.page.goto('/join/AAAAAAAAAAAAAAAAAAAAAA')
  await expect(b.page.getByTestId('join-error')).toContainText(/not valid/, { timeout: 15_000 })

  // B opens the link and lands on the board, read-only.
  await b.page.goto(joinPath)
  await b.page.waitForURL(new RegExp(`/board/${boardId}$`), { timeout: 15_000 })
  await expect(b.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
  await expect(b.page.getByTestId('view-only-badge')).toHaveText(/View only/)
  await expect(b.page.getByTestId('shape-sticky')).toHaveCount(1, { timeout: 15_000 })
  await expect(b.page.getByText('Live · view only')).toBeVisible({ timeout: 15_000 })
  await expect(b.page.getByTestId('tool-sticky')).toBeDisabled()

  // Keyboard: the sticky shortcut + Enter adds nothing; Delete on the note removes nothing.
  await b.page.getByTestId('board-viewport').focus()
  await b.page.keyboard.press('n')
  await expect(b.page.getByTestId('tool-sticky')).toHaveAttribute('aria-pressed', 'false')
  await b.page.keyboard.press('Enter')
  await expect(b.page.getByTestId('shape-editor')).toHaveCount(0)
  await b.page.getByTestId('shape-sticky').focus()
  await b.page.keyboard.press('Delete')
  await b.page.keyboard.press('Control+z')
  await expect(b.page.getByTestId('shape-sticky')).toHaveCount(1)

  // History restore/save and the share controls aren't offered.
  await expect(b.page.getByTestId('history-save')).toHaveCount(0)
  await b.page.getByTestId('share-open').click()
  await expect(b.page.getByTestId('share-links')).toHaveCount(0)
  await expect(b.page.locator('[data-testid^="share-send-"], [data-testid^="share-revoke-"]')).toHaveCount(0)
  await b.page.keyboard.press('Escape')

  // Server: the canvas socket is read-only and refuses a raw write…
  const raw = await rawCanvasWrite(b.page, boardId)
  expect(raw.canWrite).toBe(false)
  expect(raw.error).toMatch(/viewer/i)
  // …and the history/spec actions refuse viewers.
  const actionErrors = await b.page.evaluate(async (id) => {
    const { token } = (await (await fetch('/api/auth/token', { method: 'POST', credentials: 'include' })).json()) as { token: string }
    const call = async (name: string, params: Record<string, unknown>) => {
      const res = await fetch(`/api/actions/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(params),
      })
      return ((await res.json()) as { success: boolean; code?: string }).code ?? 'ok'
    }
    return [
      await call('versionCreate', { boardId: id, message: 'hack', snapshot: [] }),
      await call('specPublish', { boardId: id, title: 'hack', markdown: 'hack' }),
      await call('boardLinkCreate', { boardId: id, expiresIn: 'never' }),
      await call('boardShare', { boardId: id, friendId: 'someone' }),
    ]
  }, boardId)
  expect(actionErrors).toEqual(['forbidden', 'forbidden', 'forbidden', 'forbidden'])
  // The owner still sees exactly one note.
  await a.page.reload()
  await expect(a.page.getByTestId('shape-sticky')).toHaveCount(1, { timeout: 15_000 })

  // A sees B joined through the link, and as view only.
  await a.page.getByTestId('share-open').click()
  await expect(menu.getByTestId('share-link-list')).toContainText('1 viewer joined', { timeout: 15_000 })
  await expect(menu).toContainText('view only')

  // A revokes the link and its viewers.
  await menu.locator('[data-testid^="share-link-revoke-"]').first().click()
  const dialog = a.page.getByRole('dialog', { name: 'Revoke this link?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('checkbox', { name: /Also remove the 1 person/ }).click()
  await dialog.getByTestId('share-link-revoke-confirm').click()
  await expect(dialog).toHaveCount(0, { timeout: 15_000 })
  await expect(menu.getByText('No active links.')).toBeVisible({ timeout: 15_000 })

  // B has lost the board, and the old link now explains it was turned off.
  await b.page.goto(boardUrl)
  await expect(b.page.getByText(/hasn.t been shared with you/)).toBeVisible({ timeout: 15_000 })
  await b.page.goto(joinPath)
  await expect(b.page.getByTestId('join-error')).toContainText(/turned off/, { timeout: 15_000 })

  // Tidy up: A deletes the board (also drains its links).
  await a.page.keyboard.press('Escape')
  const del = await a.page.evaluate(async (id) => {
    const { token } = (await (await fetch('/api/auth/token', { method: 'POST', credentials: 'include' })).json()) as { token: string }
    const res = await fetch('/api/actions/boardDelete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ boardId: id }),
    })
    return ((await res.json()) as { success: boolean }).success
  }, boardId)
  expect(del).toBe(true)
})
