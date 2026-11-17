/**
 * Colors: change text color on any selected shape, and fill + border on
 * boxes, from the selection bar. Guest board, no accounts needed.
 */
import { test, expect, type Locator } from '@playwright/test'

const css = (l: Locator, prop: 'color' | 'backgroundColor' | 'borderTopColor') =>
  l.evaluate((el, p) => getComputedStyle(el)[p], prop)

test('recolor text, box fill and box border; survives a reload', async ({ page }) => {
  await page.goto('/try')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
  const viewport = page.getByTestId('board-viewport')
  const editor = page.getByTestId('shape-editor')

  await page.getByTestId('tool-box').click()
  await viewport.click({ position: { x: 250, y: 250 } })
  await editor.fill('Checkout')
  await editor.press('Enter')
  await viewport.dblclick({ position: { x: 600, y: 250 } })
  await editor.fill('A sticky')
  await editor.press('Enter')

  const box = page.getByTestId('shape-box')
  const sticky = page.getByTestId('shape-sticky')

  // A sticky alone: text color only.
  await sticky.click()
  await page.getByTestId('selection-colors').click()
  await expect(page.getByTestId('fill-black')).toHaveCount(0)
  await page.getByTestId('textColor-red').click()
  await expect.poll(() => css(sticky, 'color')).toBe('rgb(217, 48, 37)')

  // Both: text applies to both, fill/border only to the box.
  await page.keyboard.press('Control+a')
  await page.getByTestId('selection-colors').click()
  await page.getByTestId('textColor-blue').click()
  await page.getByTestId('fill-green').click()
  await page.getByTestId('stroke-purple').click()
  await expect.poll(() => css(box, 'color')).toBe('rgb(65, 105, 225)')
  await expect.poll(() => css(sticky, 'color')).toBe('rgb(65, 105, 225)')
  await expect.poll(() => css(box, 'backgroundColor')).toBe('rgb(225, 243, 230)')
  await expect.poll(() => css(box, 'borderTopColor')).toBe('rgb(142, 68, 173)')
  await expect.poll(() => css(sticky, 'backgroundColor')).toBe('rgb(255, 255, 255)')

  // A dark fill flips default text to white.
  await page.getByTestId('textColor-default').click()
  await page.getByTestId('fill-black').click()
  await expect.poll(() => css(box, 'color')).toBe('rgb(255, 255, 255)')

  await page.reload()
  await expect(box).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => css(box, 'backgroundColor')).toBe('rgb(26, 26, 26)')
  await expect.poll(() => css(box, 'borderTopColor')).toBe('rgb(142, 68, 173)')
})
