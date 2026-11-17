/**
 * The History tab starts open and can be closed and reopened. On a guest
 * board it's the only tab, so closing it folds the sidebar to a thin rail;
 * on a shared board the Call tab stays.
 */
import { test as base, expect as baseExpect } from '@playwright/test'
import { test, expect } from 'deepspace/testing'

base('guest board: close History to a rail, reopen it', async ({ page }) => {
  await page.goto('/try')
  await baseExpect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
  const sidebar = page.getByTestId('board-sidebar')
  const viewport = page.getByTestId('board-viewport')

  await baseExpect(page.getByTestId('sidebar-tab-history')).toHaveAttribute('aria-selected', 'true')
  await baseExpect(page.getByTestId('history-save')).toBeVisible()
  const narrow = (await viewport.boundingBox())!.width

  await page.getByTestId('sidebar-close-history').click()
  await baseExpect(sidebar).toHaveAttribute('data-collapsed', 'true')
  await baseExpect(page.getByTestId('history-save')).toBeHidden()
  await baseExpect.poll(async () => (await viewport.boundingBox())!.width).toBeGreaterThan(narrow + 200)

  await page.getByTestId('sidebar-open-history').click()
  await baseExpect(sidebar).not.toHaveAttribute('data-collapsed', 'true')
  await baseExpect(page.getByTestId('sidebar-tab-history')).toHaveAttribute('aria-selected', 'true')
  await baseExpect(page.getByTestId('history-save')).toBeVisible()
})

test('shared board: closing History leaves the Call tab', async ({ users }) => {
  const [a] = await users(1)
  await a.page.goto('/home')
  await a.page.getByTestId('board-title-input').fill(`Sidebar board ${Date.now()}`)
  await a.page.getByTestId('board-create').click()
  await expect(a.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })

  await a.page.getByTestId('sidebar-tab-history').click()
  await a.page.getByTestId('sidebar-close-history').click()
  await expect(a.page.getByTestId('sidebar-tab-history')).toHaveCount(0)
  await expect(a.page.getByTestId('sidebar-tab-call')).toHaveAttribute('aria-selected', 'true')
  await expect(a.page.getByTestId('board-sidebar')).not.toHaveAttribute('data-collapsed', 'true')
  // Call has no close button.
  await expect(a.page.getByTestId('sidebar-close-call')).toHaveCount(0)

  await a.page.getByTestId('sidebar-open-history').click()
  await expect(a.page.getByTestId('sidebar-tab-history')).toHaveAttribute('aria-selected', 'true')
  await expect(a.page.getByTestId('history-save')).toBeVisible()
})
