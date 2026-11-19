import { expect, type Page } from '@playwright/test'

/** The board id of the board page `page` is on (`/board/<id>`). */
export function boardIdFrom(page: Page): string {
  const id = new URL(page.url()).pathname.split('/').pop()
  if (!id) throw new Error(`not on a board page: ${page.url()}`)
  return id
}

/** Show a board sidebar panel (Call, History, Votes, Comments) through its hamburger menu. */
export async function openPanel(page: Page, id: string) {
  await page.getByTestId('sidebar-menu').click()
  await page.getByTestId(`sidebar-tab-${id}`).click()
  await expect(page.getByTestId(`sidebar-pane-${id}`)).toBeVisible()
}

/**
 * Permanently delete a board you own from /home. Boards are archived first and
 * deleted from the Archived view (the card menu offers "Delete permanently…" only there).
 */
export async function deleteBoard(page: Page, boardId: string) {
  await page.goto('/home')
  const card = page.getByTestId(`board-card-${boardId}`)
  await expect(card).toBeVisible({ timeout: 15_000 })
  await page.getByTestId(`board-menu-${boardId}`).click()
  await page.getByRole('menuitem', { name: 'Archive' }).click()
  await expect(card).toHaveCount(0, { timeout: 15_000 })
  await page.getByTestId('view-archived').click()
  await expect(card).toBeVisible({ timeout: 15_000 })
  await page.getByTestId(`board-menu-${boardId}`).click()
  await page.getByRole('menuitem', { name: /Delete permanently/ }).click()
  await page.getByRole('button', { name: 'Delete board' }).click()
  await expect(card).toHaveCount(0, { timeout: 20_000 })
}
