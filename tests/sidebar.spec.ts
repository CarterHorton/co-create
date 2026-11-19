/**
 * The board sidebar: a hamburger menu picks the panel, "Hide panel" folds the
 * sidebar to a thin rail (giving the board the room), and the rail brings it
 * back. On a guest board History is the only panel; a shared board has Call too.
 */
import { test as base, expect as baseExpect } from '@playwright/test'
import { test, expect } from 'deepspace/testing'

base('guest board: hide the panel to a rail, then show it again', async ({ page }) => {
  await page.goto('/try')
  await baseExpect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
  const sidebar = page.getByTestId('board-sidebar')
  const viewport = page.getByTestId('board-viewport')

  await baseExpect(page.getByTestId('sidebar-title')).toHaveText(/History/)
  await baseExpect(page.getByTestId('history-save')).toBeVisible()
  const narrow = (await viewport.boundingBox())!.width

  await page.getByTestId('sidebar-collapse').click()
  await baseExpect(sidebar).toHaveAttribute('data-collapsed', 'true')
  await baseExpect(page.getByTestId('history-save')).toBeHidden()
  await baseExpect.poll(async () => (await viewport.boundingBox())!.width).toBeGreaterThan(narrow + 200)

  await page.getByTestId('sidebar-expand').click()
  await baseExpect(sidebar).not.toHaveAttribute('data-collapsed', 'true')
  await baseExpect(page.getByTestId('history-save')).toBeVisible()

  // Picking a panel from the rail's menu also brings the sidebar back.
  await page.getByTestId('sidebar-collapse').click()
  await page.getByTestId('sidebar-menu').click()
  await page.getByTestId('sidebar-tab-history').click()
  await baseExpect(sidebar).not.toHaveAttribute('data-collapsed', 'true')
  await baseExpect(page.getByTestId('history-save')).toBeVisible()
})

test('shared board: the menu switches between Call and History', async ({ users }) => {
  const [a] = await users(1)
  await a.page.goto('/home')
  await a.page.getByTestId('board-title-input').fill(`Sidebar board ${Date.now()}`)
  await a.page.getByTestId('board-create').click()
  await expect(a.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })

  await expect(a.page.getByTestId('sidebar-title')).toHaveText(/Call/)
  await expect(a.page.getByTestId('sidebar-pane-call')).toBeVisible()

  const menu = a.page.getByTestId('sidebar-menu')
  await expect(menu).toHaveAccessibleName(/Board panels: Call/)
  await menu.click()
  await expect(a.page.getByTestId('sidebar-tab-call')).toHaveAttribute('aria-checked', 'true')
  await a.page.getByTestId('sidebar-tab-history').click()
  await expect(a.page.getByTestId('sidebar-title')).toHaveText(/History/)
  await expect(a.page.getByTestId('history-save')).toBeVisible()
  // The call pane stays mounted while hidden, so switching never drops a call.
  await expect(a.page.getByTestId('sidebar-pane-call')).toBeHidden()
  await expect(a.page.getByTestId('sidebar-pane-call')).toHaveCount(1)

  // Keyboard: Enter opens the menu on its first item, Enter picks it and closes the menu.
  await menu.focus()
  await a.page.keyboard.press('Enter')
  await expect(a.page.getByTestId('sidebar-tab-call')).toBeFocused()
  await a.page.keyboard.press('Enter')
  await expect(a.page.getByTestId('sidebar-title')).toHaveText(/Call/)
  await expect(a.page.getByTestId('sidebar-tab-call')).toHaveCount(0)
})
