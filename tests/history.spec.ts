/**
 * Phase 3: version history — save, auto-save, preview, restore.
 *   Guest board (no accounts) and a shared board (two test accounts).
 */
import { test as base, expect as baseExpect, type Page } from '@playwright/test'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import { shareBoard } from './helpers/share'

async function addSticky(page: Page, x: number, y: number, text: string) {
  await page.getByTestId('board-viewport').dblclick({ position: { x, y } })
  const editor = page.getByTestId('shape-editor')
  await editor.fill(text)
  await editor.press('Escape')
}

async function editSticky(page: Page, index: number, text: string) {
  await page.getByTestId('shape-sticky').nth(index).dblclick()
  const editor = page.getByTestId('shape-editor')
  await editor.fill(text)
  await editor.press('Escape')
}

base('guest board: save, auto-save, preview and restore a version', async ({ page }) => {
  base.setTimeout(60_000)
  await page.goto('/try')
  await baseExpect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('sidebar-tab-history').click()

  await addSticky(page, 300, 300, 'First idea')
  await page.getByTestId('history-message').fill('Kickoff')
  await page.getByTestId('history-save').click()
  const items = page.getByTestId('history-item')
  await baseExpect(items).toHaveCount(1)
  await baseExpect(items.first()).toContainText('Kickoff')

  // Edit, then let the idle auto-save kick in (10s).
  await editSticky(page, 0, 'Second idea')
  await baseExpect(items).toHaveCount(2, { timeout: 20_000 })
  await baseExpect(items.first()).toContainText('Edited 1')
  await baseExpect(items.first()).toContainText('auto')

  // Preview the first version: read-only, shows the old text.
  await items.nth(1).click()
  await baseExpect(page.getByTestId('preview-banner')).toBeVisible()
  await baseExpect(page.getByTestId('shape-sticky')).toContainText('First idea')
  await baseExpect(page.getByTestId('tool-sticky')).toBeDisabled()

  // Restore it.
  await page.getByTestId('preview-restore').click()
  await baseExpect(page.getByTestId('preview-banner')).toHaveCount(0)
  await baseExpect(page.getByTestId('shape-sticky')).toContainText('First idea')
  await baseExpect(items.first()).toContainText('Restored version from')
  await baseExpect(page.getByTestId('tool-sticky')).toBeEnabled()

  // History survives a reload.
  await page.reload()
  await page.getByTestId('sidebar-tab-history').click()
  await baseExpect(page.getByTestId('history-item')).toHaveCount(3)
})

test.describe('shared board history', () => {
  test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts — see collab.spec.ts.')

  test('a version saved by one user shows up for the other and can be restored', async ({ users }) => {
    test.setTimeout(60_000)
    const [a, b] = await users(2)

    await a.page.goto('/home')
    await a.page.getByTestId('board-title-input').fill(`History board ${Date.now()}`)
    await a.page.getByTestId('board-create').click()
    await expect(a.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
    await shareBoard(a, b, a.page.url())
    await expect(a.page.getByTestId('board-connection')).toHaveText(/Live/, { timeout: 15_000 })
    await b.page.goto(a.page.url())
    await expect(b.page.getByTestId('board-connection')).toHaveText(/Live/, { timeout: 15_000 })

    await addSticky(a.page, 300, 300, 'Plan A')
    await a.page.getByTestId('sidebar-tab-history').click()
    await a.page.getByTestId('history-message').fill('Plan A drafted')
    await a.page.getByTestId('history-save').click()

    // B sees the version.
    await b.page.getByTestId('sidebar-tab-history').click()
    const bItems = b.page.getByTestId('history-item')
    await expect(bItems.first()).toContainText('Plan A drafted', { timeout: 15_000 })
    await expect(bItems.first()).toContainText(a.name || a.email)

    // A changes the note; B restores the saved version for everyone.
    await editSticky(a.page, 0, 'Plan B')
    await expect(b.page.getByTestId('shape-sticky')).toContainText('Plan B', { timeout: 10_000 })
    await bItems.filter({ hasText: 'Plan A drafted' }).click()
    await b.page.getByTestId('preview-restore').click()
    await expect(a.page.getByTestId('shape-sticky')).toContainText('Plan A', { timeout: 15_000 })
    await expect(a.page.getByTestId('history-item').first()).toContainText('Restored version from', { timeout: 15_000 })
    await b.page.screenshot({ path: 'test-results/history-shared.png' })
  })
})
