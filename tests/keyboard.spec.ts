/**
 * The whiteboard without a mouse: create, write, move, resize, connect and
 * delete shapes from the keyboard. Guest board, no accounts.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'

async function freshBoard(page: Page) {
  await page.goto('/try')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
}

/** A shape's world position, from its inline style. */
async function position(shape: Locator) {
  return shape.evaluate((el) => ({
    x: parseFloat((el as HTMLElement).style.left),
    y: parseFloat((el as HTMLElement).style.top),
    width: parseFloat((el as HTMLElement).style.width),
    height: parseFloat((el as HTMLElement).style.height),
  }))
}

/** Pick the sticky tool, add a note mid-view with Enter, type `text`, finish with Enter. */
async function addStickyByKeyboard(page: Page, text: string) {
  await page.getByTestId('board-viewport').focus()
  await page.keyboard.press('n')
  await expect(page.getByTestId('tool-sticky')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Enter')
  const editor = page.getByTestId('shape-editor')
  await expect(editor).toBeFocused()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
  await expect(editor).toHaveCount(0)
}

test('the canvas is a labelled, focusable region with instructions', async ({ page }) => {
  await freshBoard(page)
  const viewport = page.getByTestId('board-viewport')
  await expect(viewport).toHaveAttribute('aria-label', 'Whiteboard canvas')
  await expect(viewport).toHaveAttribute('aria-roledescription', 'whiteboard')
  await expect(viewport).toHaveAccessibleDescription(/Arrow keys move the focused shape/)
  await viewport.focus()
  await expect(viewport).toBeFocused()
})

test('create a sticky, type, move it with arrow keys and delete it — no mouse', async ({ page }) => {
  await freshBoard(page)
  await addStickyByKeyboard(page, 'Made by keyboard')

  // Finishing the text returns focus to the note, which is named for screen readers.
  const sticky = page.getByTestId('shape-sticky')
  await expect(sticky).toHaveCount(1)
  await expect(sticky).toBeFocused()
  await expect(sticky).toHaveAccessibleName('Sticky note: Made by keyboard')
  await expect(sticky).toContainText('Made by keyboard')
  // Back to the select tool after placing it, so typed letters are shortcuts again.
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true')

  // Arrow keys move 10px; Shift+arrow 50px.
  const start = await position(sticky)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => position(sticky)).toMatchObject({ x: start.x + 20, y: start.y + 10 })
  await page.keyboard.press('Shift+ArrowLeft')
  await expect.poll(() => position(sticky)).toMatchObject({ x: start.x - 30, y: start.y + 10 })
  await expect(sticky).toBeFocused()

  // Alt+arrow resizes.
  await page.keyboard.press('Alt+ArrowRight')
  await expect.poll(async () => (await position(sticky)).width).toBe(start.width + 10)

  // Enter edits the text again; Escape keeps it and returns to the note.
  await page.keyboard.press('Enter')
  const editor = page.getByTestId('shape-editor')
  await expect(editor).toBeFocused()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await page.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
  await expect(sticky).toBeFocused()
  await expect(sticky).toContainText('Made by keyboard!')

  // Delete removes it; focus falls back to the canvas.
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('shape-sticky')).toHaveCount(0)
  await expect(page.getByTestId('board-viewport')).toBeFocused()
})

test('Tab walks shapes in reading order and C connects them with an arrow', async ({ page }) => {
  await freshBoard(page)
  await addStickyByKeyboard(page, 'First')
  // Move the first note up and left so the second (placed mid-view) reads after it.
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+ArrowUp')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Shift+ArrowLeft')
  await addStickyByKeyboard(page, 'Second')

  const first = page.getByRole('button', { name: 'Sticky note: First' })
  const second = page.getByRole('button', { name: 'Sticky note: Second' })
  await expect(second).toBeFocused()

  // Shift+Tab / Tab move between notes in reading order (top to bottom), not creation order.
  await page.keyboard.press('Shift+Tab')
  await expect(first).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(second).toBeFocused()

  // C opens "Connect to…"; Enter on a shape draws the arrow and returns focus.
  await page.keyboard.press('Shift+Tab')
  await expect(first).toBeFocused()
  await page.keyboard.press('c')
  const menu = page.getByTestId('connect-menu')
  await expect(menu).toBeVisible()
  await expect(menu.getByTestId('connect-option').first()).toBeFocused()
  await expect(menu.getByTestId('connect-option').first()).toHaveText('Sticky note: Second')
  await page.keyboard.press('Enter')
  await expect(menu).toHaveCount(0)
  await expect(page.getByTestId('board-arrow')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Arrow from “First” to “Second”' })).toHaveCount(1)
  await expect(first).toBeFocused()

  // Escape closes the menu without drawing anything.
  await page.keyboard.press('c')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(page.getByTestId('board-arrow')).toHaveCount(1)
  await expect(first).toBeFocused()
})
