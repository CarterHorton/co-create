/**
 * Selection: box-select with the left mouse, move and delete many shapes,
 * assign a selection to a named section; middle mouse / Space+drag pans.
 * Guest board, no accounts needed.
 */
import { test, expect, type Page } from '@playwright/test'

async function freshBoard(page: Page) {
  await page.goto('/try')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
}

async function addSticky(page: Page, x: number, y: number, text: string) {
  await page.getByTestId('board-viewport').dblclick({ position: { x, y } })
  const editor = page.getByTestId('shape-editor')
  await editor.fill(text)
  await editor.press('Enter')
}

const stickyByText = (page: Page, text: string) => page.getByTestId('shape-sticky').filter({ hasText: text })

async function dragOnViewport(page: Page, from: [number, number], to: [number, number], button: 'left' | 'middle' = 'left') {
  const box = (await page.getByTestId('board-viewport').boundingBox())!
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down({ button })
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 8 })
  await page.mouse.up({ button })
}

test('box-select, group move, assign a section, export, multi-delete', async ({ page }) => {
  await freshBoard(page)
  await addSticky(page, 200, 250, 'Email login')
  await addSticky(page, 450, 250, 'Password reset')
  await addSticky(page, 800, 500, 'Pricing page')

  // Box-select the first two (left-drag on empty canvas).
  await dragOnViewport(page, [60, 120], [600, 400])
  await expect(page.getByTestId('selection-count')).toHaveText('2 selected')

  // Dragging one moves both.
  const before = (await stickyByText(page, 'Password reset').boundingBox())!
  const login = (await stickyByText(page, 'Email login').boundingBox())!
  await page.mouse.move(login.x + 30, login.y + 30)
  await page.mouse.down()
  await page.mouse.move(login.x + 30, login.y + 130, { steps: 8 })
  await page.mouse.up()
  const after = (await stickyByText(page, 'Password reset').boundingBox())!
  expect(Math.round(after.y - before.y)).toBe(100)
  await expect(page.getByTestId('selection-count')).toHaveText('2 selected')

  // Assign them to a section.
  await page.getByTestId('section-name-input').fill('Authentication')
  await page.getByTestId('section-assign').click()
  await expect(page.getByTestId('shape-section-tag')).toHaveCount(2)
  await expect(page.getByTestId('shape-section-tag').first()).toHaveText('Authentication')

  // Overlay and export use the named section.
  await page.getByTestId('toggle-sections').click()
  await expect(page.getByTestId('section-outline').filter({ hasText: 'Authentication' })).toHaveCount(1)
  await page.getByTestId('export-md').click()
  const md = page.getByTestId('export-preview')
  await expect(md).toContainText('## 1. Authentication')
  await expect(md).toContainText('- Email login')
  await expect(md).toContainText('- Password reset')
  await expect(md).toContainText('## 2. Pricing page')
  await page.screenshot({ path: 'test-results/selection-export.png' })
  await page.keyboard.press('Escape')
  await page.getByTestId('toggle-sections').click()

  // A plain click on empty canvas clears the selection.
  await page.getByTestId('board-viewport').click({ position: { x: 900, y: 150 } })
  await expect(page.getByTestId('selection-bar')).toHaveCount(0)

  // Shift-click two notes, delete both with the keyboard.
  await stickyByText(page, 'Pricing page').click()
  await stickyByText(page, 'Email login').click({ modifiers: ['Shift'] })
  await expect(page.getByTestId('selection-count')).toHaveText('2 selected')
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('shape-sticky')).toHaveCount(1)
  await expect(page.getByTestId('shape-sticky')).toContainText('Password reset')

  // Undo brings both back in one step.
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('shape-sticky')).toHaveCount(3)
})

test('middle mouse and Space+drag pan instead of selecting', async ({ page }) => {
  await freshBoard(page)
  await addSticky(page, 300, 300, 'Anchor')
  const note = stickyByText(page, 'Anchor')

  const a = (await note.boundingBox())!
  await dragOnViewport(page, [700, 500], [600, 450], 'middle')
  const b = (await note.boundingBox())!
  expect(Math.round(b.x - a.x)).toBe(-100)
  expect(Math.round(b.y - a.y)).toBe(-50)
  // Panning leaves the selection alone (the note stays selected after Enter) and draws no box.
  await expect(page.getByTestId('selection-count')).toHaveText('1 selected')
  await expect(page.getByTestId('marquee')).toHaveCount(0)

  // Space + left drag also pans — even starting on a note — and doesn't move it.
  const vp = (await page.getByTestId('board-viewport').boundingBox())!
  await page.keyboard.down(' ')
  await page.mouse.move(b.x + 20, b.y + 20)
  await page.mouse.down()
  await page.mouse.move(b.x + 220, b.y + 20, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.up(' ')
  const c = (await note.boundingBox())!
  expect(Math.round(c.x - b.x)).toBe(200)
  await expect(page.getByTestId('marquee')).toHaveCount(0)
  expect(vp.width).toBeGreaterThan(0)

  // The note itself never moved in board space: reload resets the camera, it is where it was created.
  await page.reload()
  const d = (await stickyByText(page, 'Anchor').boundingBox({ timeout: 15_000 }))!
  expect(Math.round(d.x)).toBe(Math.round(a.x))
})
