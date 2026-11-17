/**
 * Keyboard shortcuts and the tooltips that advertise them. Guest board, no accounts.
 */
import { test, expect } from '@playwright/test'

test('toolbar tooltips name each control and its shortcut', async ({ page }) => {
  await page.goto('/try')
  await expect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
  const mod = await page.evaluate(() => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'))

  const cases: [string, string, string][] = [
    ['tool-sticky', 'Sticky note', 'N'],
    ['tool-select', 'Select', 'V'],
    ['tool-box', 'Box', 'B'],
    ['tool-text', 'Text', 'T'],
    ['tool-arrow', 'Arrow', 'A'],
    ['route-curve', 'Curve arrow', '3'],
    ['toggle-sections', 'Outline the sections', 'G'],
    ['export-md', 'Export the board as Markdown', 'E'],
    ['zoom-level', 'Reset zoom', '0'],
  ]
  for (const [testId, label, keys] of cases) {
    await page.getByTestId(testId).hover()
    const hint = page.getByTestId('hint').filter({ hasText: label })
    await expect(hint).toBeVisible()
    await expect(hint.getByTestId('hint-keys')).toHaveText(keys)
    await page.mouse.move(600, 650)
    await expect(hint).toHaveCount(0)
  }

  await page.getByRole('button', { name: 'Undo' }).hover()
  await expect(page.getByTestId('hint').filter({ hasText: 'Undo' }).getByTestId('hint-keys')).toHaveText(
    mod === '⌘' ? '⌘Z' : 'Ctrl+Z',
  )
  // The tool buttons also show their key on the button itself.
  await expect(page.getByTestId('tool-sticky')).toContainText('N')
  await page.mouse.move(600, 650)
  await page.screenshot({ path: 'test-results/shortcut-hint.png' })
})

test('shortcuts do what the buttons do', async ({ page }) => {
  await page.goto('/try')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
  const viewport = page.getByTestId('board-viewport')

  // N picks the sticky-note tool; a click places one.
  await page.keyboard.press('n')
  await expect(page.getByTestId('tool-sticky')).toHaveAttribute('aria-pressed', 'true')
  await viewport.click({ position: { x: 300, y: 300 } })
  await page.getByTestId('shape-editor').fill('Made with N')
  await page.getByTestId('shape-editor').press('Enter')
  await expect(page.getByTestId('shape-sticky')).toContainText('Made with N')

  await page.keyboard.press('v')
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('3')
  await expect(page.getByTestId('route-curve')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('1')
  await expect(page.getByTestId('route-straight')).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('g')
  await expect(page.getByTestId('toggle-sections')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('g')
  await expect(page.getByTestId('toggle-sections')).toHaveAttribute('aria-pressed', 'false')

  await page.keyboard.press('+')
  await expect(page.getByTestId('zoom-level')).toHaveText('125%')
  await page.keyboard.press('-')
  await page.keyboard.press('-')
  await expect(page.getByTestId('zoom-level')).toHaveText('75%')
  await page.keyboard.press('0')
  await expect(page.getByTestId('zoom-level')).toHaveText('100%')

  await page.keyboard.press('e')
  await expect(page.getByTestId('export-preview')).toContainText('Made with N')
  await page.keyboard.press('Escape')

  // Typing in a note never triggers shortcuts.
  await page.getByTestId('shape-sticky').dblclick()
  await page.getByTestId('shape-editor').pressSequentially(' and g e 3')
  await page.getByTestId('shape-editor').press('Enter')
  await expect(page.getByTestId('shape-sticky')).toContainText('and g e 3')
  await expect(page.getByTestId('toggle-sections')).toHaveAttribute('aria-pressed', 'false')
})
