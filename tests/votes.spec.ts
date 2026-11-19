/**
 * Vote panels: A selects two of three sticky notes and opens a vote on them.
 * B gets a toast, sees those notes marked and the panel, and votes; only the
 * panel's notes can be voted on, within the per-person limit. A closes the
 * panel, which finalizes the results for both. A second vote closes on its
 * own when A leaves the board. Two test accounts.
 */
import type { Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { shareBoard } from './helpers/share'
import { deleteBoard, openPanel } from './helpers/boards'
import { callAction } from './helpers/actions'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts — see collab.spec.ts.')

async function addSticky(page: Page, x: number, y: number, text: string) {
  await page.getByTestId('board-viewport').dblclick({ position: { x, y } })
  const editor = page.getByTestId('shape-editor')
  await expect(editor).toBeVisible({ timeout: 10_000 })
  await editor.fill(text)
  await editor.press('Escape')
}

const sticky = (page: Page, text: string) => page.getByTestId('shape-sticky').filter({ hasText: text })
const option = (page: Page, text: string) => page.getByTestId('vote-option').filter({ hasText: text })

test('a vote panel on selected notes: open, vote, close, and close when the opener leaves', async ({ users }) => {
  test.setTimeout(150_000)
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
  await addSticky(a.page, 250, 520, 'Themes')
  await expect(b.page.getByTestId('shape-sticky')).toHaveCount(3, { timeout: 10_000 })

  // One note selected: no Start vote. Two: Start vote.
  await sticky(a.page, 'Dark mode').click()
  await expect(a.page.getByTestId('vote-start')).toHaveCount(0)
  await sticky(a.page, 'Offline sync').click({ modifiers: ['Shift'] })
  await a.page.getByTestId('vote-start').click()
  await expect(a.page.getByTestId('vote-per-person')).toHaveValue('1')
  await a.page.getByTestId('vote-start-confirm').click()

  // Both see the panel with just the two selected notes, marked on the board; B gets a toast.
  for (const p of [a.page, b.page]) {
    await expect(p.getByTestId('vote-panel')).toBeVisible({ timeout: 15_000 })
    await expect(p.getByTestId('vote-option')).toHaveCount(2)
    await expect(p.getByTestId('vote-mark')).toHaveCount(2)
    await expect(option(p, 'Themes')).toHaveCount(0)
  }
  await expect(b.page.getByText(/opened a vote on 2 notes/)).toBeVisible()
  await expect(b.page.getByTestId('vote-panel-close')).toHaveCount(0)
  await expect(a.page.getByTestId('vote-panel-close')).toBeVisible()

  // B votes from the panel; A sees the count live.
  await option(b.page, 'Dark mode').click()
  await expect(option(b.page, 'Dark mode')).toHaveAttribute('aria-pressed', 'true')
  await expect(b.page.getByTestId('vote-panel-left')).toHaveText('0 of 1 vote left')
  await expect(a.page.locator(`[data-testid="vote-badge"][data-note="${await sticky(a.page, 'Dark mode').getAttribute('data-shape-id')}"]`)).toContainText('1', { timeout: 10_000 })

  // One vote each: a second one is refused until B removes the first.
  await option(b.page, 'Offline sync').click()
  await expect(b.page.getByTestId('vote-panel').getByRole('alert')).toContainText(/already voted/)
  await expect(option(b.page, 'Offline sync')).toHaveAttribute('aria-pressed', 'false')

  // A votes with the keyboard: select a note in the vote, press U.
  await sticky(a.page, 'Offline sync').click()
  await a.page.keyboard.press('u')
  await expect(option(a.page, 'Offline sync')).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 })

  // The server refuses votes on notes outside the panel (and on panels that don't exist).
  const themesId = (await sticky(b.page, 'Themes').getAttribute('data-shape-id'))!
  const panelId = (await b.page.getByTestId('vote-panel').getAttribute('data-panel'))!
  expect(await callAction(b.page, 'voteToggle', { panelId, shapeId: themesId })).toMatchObject({ success: false, code: 'bad_request' })
  expect(await callAction(b.page, 'voteToggle', { panelId: 'nope', shapeId: themesId })).toMatchObject({ success: false })
  // …and B can't close A's panel while A is here.
  expect(await callAction(b.page, 'votePanelClose', { panelId })).toMatchObject({ success: false, code: 'forbidden' })

  // Only A can close it; closing finalizes the results for both.
  await a.page.getByTestId('vote-panel-close').click()
  for (const p of [a.page, b.page]) {
    await expect(p.getByTestId('vote-panel')).toHaveCount(0, { timeout: 15_000 })
    const results = p.getByTestId('vote-panel-results')
    await expect(results).toBeVisible()
    await expect(results.getByTestId('vote-result')).toHaveCount(2)
    await expect(results.getByTestId('vote-result').and(p.locator('[data-top]'))).toHaveCount(2) // a 1–1 tie
  }
  await expect(b.page.getByText(/closed the vote/)).toBeVisible()
  await b.page.getByTestId('vote-results-dismiss').click()
  await expect(b.page.getByTestId('vote-panel-results')).toHaveCount(0)
  await openPanel(b.page, 'votes')
  await expect(b.page.getByTestId('past-vote')).toHaveCount(1)

  // The export can include the final counts.
  await a.page.getByTestId('export-md').click()
  await expect(a.page.getByTestId('export-preview')).toContainText(/## 1\. Dark mode\s+_1 vote_/)
  await a.page.keyboard.press('Escape')

  // A second vote, then A leaves the board: it closes for B.
  await sticky(a.page, 'Dark mode').click()
  await sticky(a.page, 'Themes').click({ modifiers: ['Shift'] })
  await a.page.getByTestId('vote-start').click()
  await a.page.getByTestId('vote-start-confirm').click()
  await expect(b.page.getByTestId('vote-panel')).toBeVisible({ timeout: 15_000 })
  await a.page.goto('/home')
  await expect(b.page.getByTestId('vote-panel')).toHaveCount(0, { timeout: 45_000 })
  await expect(b.page.getByText(/left, so their vote closed/)).toBeVisible()

  await deleteBoard(a.page, boardUrl.split('/').pop()!)
})
