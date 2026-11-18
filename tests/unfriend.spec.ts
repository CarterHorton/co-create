/**
 * Removing a friend. Runs in its own Playwright project AFTER every other
 * spec (see tests/playwright.config.ts): the suite shares two test accounts,
 * and unfriending them revokes boards other specs are using in parallel.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { befriend, displayName, shareBoard } from './helpers/share'

const usableTestAccounts = loadAllTestAccounts().length
test.skip(usableTestAccounts < 2, `Needs 2 usable test accounts, found ${usableTestAccounts}.`)

test('removing a friend revokes boards between you, and a new code re-adds them', async ({ users }) => {
  test.setTimeout(120_000)
  const [a, b] = await users(2)
  await Promise.all([a.page.goto('/home'), b.page.goto('/home')])
  await expect(a.page.getByTestId('boards-page')).toBeVisible({ timeout: 15_000 })
  await expect(b.page.getByTestId('boards-page')).toBeVisible({ timeout: 15_000 })
  const [aName, bName] = await Promise.all([displayName(a.page), displayName(b.page)])
  const removeB = a.page.getByRole('button', { name: `Remove ${bName} from your party`, exact: true })
  const removeAFromB = b.page.getByRole('button', { name: `Remove ${aName} from your party`, exact: true })

  // A makes a board and sends it to B (shareBoard befriends them first and
  // leaves B on /home).
  const title = `Unfriend ${Date.now()}`
  await a.page.getByTestId('board-title-input').fill(title)
  await a.page.getByTestId('board-create').click()
  await a.page.waitForURL(/\/board\//)
  await expect(a.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
  const boardUrl = a.page.url()
  const boardId = boardUrl.split('/board/')[1]
  await shareBoard(a, b, boardUrl)
  await expect(b.page.getByTestId(`board-card-${boardId}`)).toBeVisible({ timeout: 15_000 })

  // A removes B, through the confirmation dialog.
  await a.page.goto('/home')
  await expect(removeB).toBeVisible({ timeout: 15_000 })
  await removeB.click()
  const dialog = a.page.getByTestId('friend-remove-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(/boards you've shared with each other/)
  await dialog.getByTestId('friend-remove-confirm').click()
  await expect(a.page.getByText(`${bName} removed from your party`)).toBeVisible({ timeout: 15_000 })
  await expect(dialog).toBeHidden()

  // Gone from both parties (B's updates live), and B lost the board.
  await expect(removeB).toHaveCount(0, { timeout: 15_000 })
  await expect(removeAFromB).toHaveCount(0, { timeout: 15_000 })
  await expect(b.page.getByTestId(`board-card-${boardId}`)).toHaveCount(0, { timeout: 15_000 })
  await b.page.goto(boardUrl)
  await expect(b.page.getByText(/hasn.t been shared with you/)).toBeVisible({ timeout: 15_000 })

  // A fresh friend code makes them friends again (no leftover state blocks it).
  await befriend(a, b)
  await expect(removeB).toBeVisible({ timeout: 15_000 })
  await expect(removeAFromB).toBeVisible({ timeout: 15_000 })
})
