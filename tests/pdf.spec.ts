/**
 * PDF export: the whole board (including notes far off screen) as one
 * low-resolution page. Guest board, no accounts needed.
 */
import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'

test('exports the whole board as a small one-page PDF', async ({ page }) => {
  await page.goto('/try')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('try-title').fill('Wide board')

  const viewport = page.getByTestId('board-viewport')
  const editor = page.getByTestId('shape-editor')
  await viewport.dblclick({ position: { x: 250, y: 250 } })
  await editor.fill('Near')
  await editor.press('Enter')
  // Zoom far out and add a note well outside the first screen.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Zoom out' }).click()
  await viewport.dblclick({ position: { x: 700, y: 500 } })
  await editor.fill('Far')
  await editor.press('Enter')
  await page.getByRole('button', { name: 'Reset zoom' }).click()

  await page.getByTestId('export-md').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-pdf').click()])
  expect(download.suggestedFilename()).toBe('wide-board.pdf')
  const bytes = readFileSync((await download.path())!)
  const text = bytes.toString('latin1')
  expect(text.startsWith('%PDF-1.4')).toBe(true)
  expect(text).toContain('/Count 1')
  // Capped resolution: the image is at most 1600 px on its longest side, and the file stays small.
  const [, w, h] = text.match(/\/Width (\d+) \/Height (\d+)/)!
  expect(Math.max(Number(w), Number(h))).toBeLessThanOrEqual(1600)
  expect(bytes.length).toBeLessThan(500_000)
})
