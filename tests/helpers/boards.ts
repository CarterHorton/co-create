import { expect, type Page } from '@playwright/test'

/** The board id of the board page `page` is on (`/board/<id>`). */
export function boardIdFrom(page: Page): string {
  const id = new URL(page.url()).pathname.split('/').pop()
  if (!id) throw new Error(`not on a board page: ${page.url()}`)
  return id
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
