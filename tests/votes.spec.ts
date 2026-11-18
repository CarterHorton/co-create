/**
 * Voting on sticky notes: vote / unvote from the selection bar and with U,
 * live counts for everyone on the board, the "Top voted" list, a dot-voting
 * round with a per-person limit, and clearing votes. Two test accounts.
 */
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { shareBoard } from './helpers/share'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts — see collab.spec.ts.')

async function addSticky(page: Page, x: number, y: number, text: string) {
  await page.getByTestId('board-viewport').dblclick({ position: { x, y } })
  const editor = page.getByTestId('shape-editor')
  await expect(editor).toBeVisible({ timeout: 10_000 })
  await editor.fill(text)
  await editor.press('Escape')
}

const sticky = (page: Page, text: string) => page.getByTestId('shape-sticky').filter({ hasText: text })
const badgeOf = async (page: Page, text: string) => {
  const id = await sticky(page, text).getAttribute('data-shape-id')
  return page.locator(`[data-testid="vote-badge"][data-note="${id}"]`)
}

test('people on a board vote on notes, live, with an optional dot-voting round', async ({ users }) => {
  test.setTimeout(120_000)
  const [a, b] = await users(2)

  await a.page.goto('/home')
  await a.page.getByTestId('board-title-input').fill(`Votes board ${Date.now()}`)
  await a.page.getByTestId('board-create').click()
  await expect(a.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
  const boardUrl = a.page.url()
  await shareBoard(a, b, boardUrl)
  await expect(a.page.getByTestId('board-connection')).toHaveText(/Live/, { timeout: 15_000 })
  await b.page.goto(boardUrl)
  await expect(b.page.getByTestId('board-connection')).toHaveText(/Live/, { timeout: 15_000 })

  await addSticky(a.page, 250, 300, 'Dark mode')
  await addSticky(a.page, 600, 300, 'Offline sync')
  await expect(b.page.getByTestId('shape-sticky')).toHaveCount(2, { timeout: 10_000 })

  // A votes from the selection bar.
  await sticky(a.page, 'Dark mode').click()
  const toggle = a.page.getByTestId('vote-toggle')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const aDark = await badgeOf(a.page, 'Dark mode')
  await expect(aDark).toContainText('1')
  await expect(aDark).toContainText('you')
  await expect(a.page.getByTestId('votes-announcer')).toHaveText(/Voted, 1 vote/)
  await expect(sticky(a.page, 'Dark mode')).toHaveAttribute('aria-label', /1 vote, including yours/)

  // B sees it live (not marked as theirs), then votes with the U key.
  const bDark = await badgeOf(b.page, 'Dark mode')
  await expect(bDark).toContainText('1', { timeout: 10_000 })
  await expect(bDark).not.toContainText('you')
  await sticky(b.page, 'Dark mode').click()
  await b.page.keyboard.press('u')
  await expect(bDark).toContainText('2')
  await expect(bDark).toContainText('you')
  await expect(aDark).toContainText('2', { timeout: 10_000 })

  // U again removes B's vote.
  await b.page.keyboard.press('u')
  await expect(bDark).toContainText('1')
  await expect(bDark).not.toContainText('you')
  await expect(b.page.getByTestId('votes-announcer')).toHaveText(/Vote removed, 1 vote/)

  // Top voted: pans to (and selects) the note.
  await b.page.getByTestId('sidebar-tab-votes').click()
  const items = b.page.getByTestId('top-voted-item')
  await expect(items).toHaveCount(1)
  await expect(items.first()).toContainText('Dark mode')
  await items.first().click()
  await expect(sticky(b.page, 'Dark mode')).toBeFocused()

  // Only the owner runs a round.
  await expect(b.page.getByTestId('vote-round-start')).toHaveCount(0)
  await a.page.getByTestId('sidebar-tab-votes').click()
  await a.page.getByTestId('vote-round-limit').fill('1')
  await a.page.getByTestId('vote-round-clear').click() // keep current votes
  await a.page.getByTestId('vote-round-start').click()
  await expect(a.page.getByTestId('vote-round-status')).toContainText('1 vote per person')
  await expect(b.page.getByTestId('vote-round-status')).toContainText('1 vote per person', { timeout: 10_000 })
  await expect(b.page.getByTestId('votes-announcer')).toHaveText(/Voting round started/)
  // A already used their one vote on "Dark mode".
  await expect(a.page.getByTestId('vote-round-left')).toContainText('0 of 1 vote left')

  // The server refuses a second vote while the round is on.
  await sticky(a.page, 'Offline sync').click()
  await expect(a.page.getByTestId('votes-left')).toHaveText('0 of 1 vote left')
  await a.page.getByTestId('vote-toggle').click()
  await expect(a.page.getByTestId('vote-error')).toContainText(/used all 1 of your votes/)
  await expect(await badgeOf(a.page, 'Offline sync')).toHaveCount(0)

  // B still has a vote to spend.
  await sticky(b.page, 'Offline sync').click()
  await expect(b.page.getByTestId('votes-left')).toHaveText('1 of 1 vote left')
  await b.page.getByTestId('vote-toggle').click()
  await expect(await badgeOf(b.page, 'Offline sync')).toContainText('1')
  await expect(b.page.getByTestId('votes-left')).toHaveText('0 of 1 vote left')

  // Export can include the counts.
  await a.page.getByTestId('export-md').click()
  await expect(a.page.getByTestId('export-preview')).toContainText(/1 vote/, { timeout: 10_000 })
  await a.page.getByTestId('export-include-votes').click()
  await expect(a.page.getByTestId('export-preview')).not.toContainText('vote')
  await a.page.keyboard.press('Escape')

  // End the round (confirmed), then clear every vote (confirmed).
  await a.page.getByTestId('vote-round-end').click()
  await a.page.getByRole('button', { name: 'End round' }).last().click()
  await expect(a.page.getByTestId('vote-round-status')).toContainText('unlimited')
  await expect(b.page.getByTestId('vote-round-status')).toContainText('unlimited', { timeout: 10_000 })
  await a.page.getByTestId('vote-clear').click()
  await a.page.getByRole('button', { name: 'Clear votes' }).click()
  await expect(a.page.getByTestId('vote-badge')).toHaveCount(0, { timeout: 10_000 })
  await expect(b.page.getByTestId('vote-badge')).toHaveCount(0, { timeout: 10_000 })
})
