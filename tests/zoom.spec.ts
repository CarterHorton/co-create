/** Zoom moves in 25% steps from the buttons and from Ctrl+scroll. Guest board, no accounts. */
import { test, expect } from '@playwright/test'

test('zoom steps by 25% with the buttons and Ctrl+scroll', async ({ page }) => {
  await page.goto('/try')
  await expect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
  const level = page.getByTestId('zoom-level')
  await expect(level).toHaveText('100%')

  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(level).toHaveText('125%')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(level).toHaveText('150%')
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await expect(level).toHaveText('75%')

  // One Ctrl+wheel notch = one step.
  const box = (await page.getByTestId('board-viewport').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -100)
  await expect(level).toHaveText('100%')
  await page.mouse.wheel(0, -100)
  await expect(level).toHaveText('125%')
  await page.mouse.wheel(0, 100)
  await expect(level).toHaveText('100%')
  await page.keyboard.up('Control')

  // Limits: 25% to 300%.
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Zoom out' }).click()
  await expect(level).toHaveText('25%')
  for (let i = 0; i < 15; i++) await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect(level).toHaveText('300%')
})
