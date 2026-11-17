/**
 * Text editing: what you type is kept however you finish.
 *   Enter finishes, Shift+Enter adds a line, clicking away saves.
 * Runs on the guest board (no accounts needed); the shared board uses the
 * same editor.
 */
import { test, expect, type Page } from '@playwright/test'

async function freshBoard(page: Page) {
  await page.goto('/try')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
}

test('Enter finishes editing and keeps the text; Shift+Enter adds a line', async ({ page }) => {
  await freshBoard(page)
  await page.getByTestId('board-viewport').dblclick({ position: { x: 300, y: 300 } })
  const editor = page.getByTestId('shape-editor')
  await expect(editor).toBeVisible()
  await editor.pressSequentially('First line')
  await editor.press('Shift+Enter')
  await editor.pressSequentially('Second line')
  await editor.press('Enter')

  await expect(editor).toHaveCount(0)
  const sticky = page.getByTestId('shape-sticky')
  await expect(sticky).toHaveCount(1)
  await expect(sticky.locator('p')).toHaveText('First line\nSecond line')
})

test('clicking the canvas or another note saves what was typed', async ({ page }) => {
  await freshBoard(page)
  const viewport = page.getByTestId('board-viewport')
  const editor = page.getByTestId('shape-editor')

  // Note 1, then click empty canvas while still typing.
  await viewport.dblclick({ position: { x: 250, y: 300 } })
  await editor.pressSequentially('Saved by clicking the canvas')
  await viewport.click({ position: { x: 700, y: 600 } })
  await expect(editor).toHaveCount(0)

  // Note 2, then click note 1 while still typing.
  await viewport.dblclick({ position: { x: 650, y: 300 } })
  await editor.pressSequentially('Saved by clicking another note')
  await page.getByTestId('shape-sticky').nth(0).click()
  await expect(editor).toHaveCount(0)

  const notes = page.getByTestId('shape-sticky')
  await expect(notes.nth(0)).toContainText('Saved by clicking the canvas')
  await expect(notes.nth(1)).toContainText('Saved by clicking another note')

  // And it really was saved: survives a reload.
  await page.reload()
  await expect(page.getByTestId('shape-sticky').nth(0)).toContainText('Saved by clicking the canvas', { timeout: 15_000 })
  await expect(page.getByTestId('shape-sticky').nth(1)).toContainText('Saved by clicking another note')
})

test('placing a note with the sticky tool opens it for typing', async ({ page }) => {
  await freshBoard(page)
  await page.getByTestId('tool-sticky').click()
  await page.getByTestId('board-viewport').click({ position: { x: 300, y: 300 } })
  const editor = page.getByTestId('shape-editor')
  await expect(editor).toBeVisible()
  await expect(editor).toBeFocused()
  await editor.pressSequentially('Placed with the tool')
  await editor.press('Enter')
  await expect(page.getByTestId('shape-sticky')).toContainText('Placed with the tool')
})
