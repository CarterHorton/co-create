/**
 * Shared countdown timer: one timer per board, the same for everyone.
 *   A starts it, B sees it counting; A pauses it, B sees it paused.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'
import { shareBoard } from './helpers/share'

/** Seconds shown on the header countdown ("04:58" → 298). */
async function shownSeconds(page: Page): Promise<number> {
  const text = ((await page.getByTestId('timer-display').textContent()) ?? '').trim()
  const parts = text.split(':').map(Number)
  return parts.reduce((acc, n) => acc * 60 + n, 0)
}

test.describe('shared board timer', () => {
  test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts — see collab.spec.ts.')

  test('a timer started by one user counts down for the other, and pauses for both', async ({ users }) => {
    test.setTimeout(90_000)
    const [a, b] = await users(2)
    const title = `Timer board ${Date.now()}`

    await a.page.goto('/home')
    await a.page.getByTestId('board-title-input').fill(title)
    await a.page.getByTestId('board-create').click()
    await expect(a.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
    await shareBoard(a, b, a.page.url())
    await b.page.goto(a.page.url())
    await expect(b.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
    await expect(b.page.getByTestId('timer-open')).toHaveAttribute('data-status', 'idle', { timeout: 15_000 })

    // A starts a 5-minute timer.
    await a.page.getByTestId('timer-open').click()
    await a.page.getByTestId('timer-preset-5').click()
    await expect(a.page.getByTestId('timer-preset-5')).toHaveAttribute('aria-pressed', 'true')
    await a.page.getByTestId('timer-start').click()
    await expect(a.page.getByTestId('timer-open')).toHaveAttribute('data-status', 'running', { timeout: 15_000 })

    // B sees it running and counting down, without touching anything.
    await expect(b.page.getByTestId('timer-open')).toHaveAttribute('data-status', 'running', { timeout: 15_000 })
    await expect(b.page.getByTestId('timer-display')).toHaveText(/^0[45]:\d\d$/)
    const first = await shownSeconds(b.page)
    await expect.poll(() => shownSeconds(b.page), { timeout: 5_000 }).toBeLessThan(first)
    // Both agree to within a second or two (server clock, not local clocks).
    const [sa, sb] = await Promise.all([shownSeconds(a.page), shownSeconds(b.page)])
    expect(Math.abs(sa - sb)).toBeLessThanOrEqual(2)
    // B was told, politely, who started it.
    await expect(b.page.getByTestId('timer-live')).toHaveText(/Timer started: 5 minutes, by /)
    // The ticking digits are hidden from screen readers; the button has a stable name.
    await expect(b.page.getByTestId('timer-open')).toHaveAccessibleName(/Board timer: running/)

    // A pauses; B sees it paused, and the countdown stops.
    await a.page.getByTestId('timer-pause').click()
    await expect(a.page.getByTestId('timer-resume')).toBeVisible({ timeout: 15_000 })
    await expect(b.page.getByTestId('timer-open')).toHaveAttribute('data-status', 'paused', { timeout: 15_000 })
    await expect(b.page.getByTestId('timer-paused-icon')).toBeVisible()
    await expect(b.page.getByTestId('timer-live')).toHaveText(/Timer paused, by /)
    const frozen = await b.page.getByTestId('timer-display').textContent()
    await b.page.waitForTimeout(1_500)
    await expect(b.page.getByTestId('timer-display')).toHaveText(frozen ?? '')

    // B (an editor) can open the controls too; tidy up by resetting.
    await b.page.getByTestId('timer-open').click()
    await expect(b.page.getByTestId('timer-status')).toHaveText('Paused')
    await b.page.getByTestId('timer-reset').click()
    await expect(a.page.getByTestId('timer-open')).toHaveAttribute('data-status', 'idle', { timeout: 15_000 })

    // Deleting the board also deletes its timer row (boardDelete cascade).
    await a.page.goto('/home')
    await a.page.getByRole('button', { name: `Delete ${title}` }).click()
    await a.page.getByRole('button', { name: 'Delete board' }).click()
    await expect(a.page.getByRole('button', { name: `Delete ${title}` })).toHaveCount(0, { timeout: 15_000 })
  })
})
