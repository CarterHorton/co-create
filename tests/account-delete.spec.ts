/**
 * Self-serve account deletion (Settings → Delete account).
 *
 * Runs in its own Playwright project AFTER every other spec, including
 * unfriend (see tests/playwright.config.ts): it wipes test account A's boards,
 * friends and profile, which the parallel specs rely on.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { displayName, shareBoard } from './helpers/share'

const usableTestAccounts = loadAllTestAccounts().length
test.skip(usableTestAccounts < 2, `Needs 2 usable test accounts, found ${usableTestAccounts}.`)

async function createBoard(page: import('@playwright/test').Page, title: string): Promise<string> {
  await page.goto('/home')
  await expect(page.getByTestId('boards-page')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('board-title-input').fill(title)
  await page.getByTestId('board-create').click()
  await page.waitForURL(/\/board\//)
  await expect(page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
  return page.url()
}

test.describe.configure({ mode: 'serial' })

test('deleting an account removes its boards and friendships and leaves others intact', async ({ users }) => {
  test.setTimeout(180_000)
  const [a, b] = await users(2)

  // A owns a board shared with B; B owns a board shared with A.
  const aBoardUrl = await createBoard(a.page, `Delete-me ${Date.now()}`)
  const aBoardId = aBoardUrl.split('/board/')[1]
  await shareBoard(a, b, aBoardUrl)
  const bBoardUrl = await createBoard(b.page, `Keep-me ${Date.now()}`)
  const bBoardId = bBoardUrl.split('/board/')[1]
  await shareBoard(b, a, bBoardUrl)
  const aName = await displayName(a.page)

  await b.page.goto('/home')
  await expect(b.page.getByTestId(`board-card-${aBoardId}`)).toBeVisible({ timeout: 15_000 })

  // A deletes their account. The confirm button stays off until DELETE is typed.
  await a.page.goto('/settings')
  await a.page.getByTestId('delete-account').getByRole('button', { name: /Delete account/ }).click()
  const confirm = a.page.getByRole('button', { name: 'Delete account', exact: true })
  await expect(confirm).toBeDisabled()
  await a.page.getByLabel(/to confirm/).fill('delete')
  await expect(confirm).toBeDisabled()
  await a.page.getByLabel(/to confirm/).fill('DELETE')
  await confirm.click()
  await a.page.waitForURL((url) => url.pathname === '/', { timeout: 60_000 })

  // B lost A's board and A as a friend, and kept their own board.
  await b.page.goto('/home')
  await expect(b.page.getByTestId('boards-page')).toBeVisible({ timeout: 15_000 })
  await expect(b.page.getByTestId(`board-card-${bBoardId}`)).toBeVisible({ timeout: 15_000 })
  await expect(b.page.getByTestId(`board-card-${aBoardId}`)).toHaveCount(0, { timeout: 15_000 })
  await expect(b.page.getByRole('button', { name: `Remove ${aName} from your party`, exact: true })).toHaveCount(0)
  await b.page.goto(aBoardUrl)
  await expect(b.page.getByText(/hasn.t been shared with you|not found/i)).toBeVisible({ timeout: 15_000 })
})

test('signing in again after deletion starts a fresh, working account', async ({ users }) => {
  // force: deletion signed A out, revoking the session the fixture cached for
  // this run, so sign in fresh, as a returning user would.
  const [a] = await users(1, { force: true })
  await a.page.goto('/settings')
  await expect(a.page.getByTestId('nav-user-name')).toHaveText(/\S/, { timeout: 15_000 })
  await expect(a.page.getByTestId('delete-account')).toBeVisible()
  await a.page.goto('/home')
  await expect(a.page.getByTestId('boards-page')).toBeVisible({ timeout: 15_000 })
})
