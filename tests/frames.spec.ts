/**
 * Frames and sticky note types: add and name a frame by keyboard, put a
 * sticky in it, move the frame (its contents come along), type the sticky as
 * a question, and see both in the exported spec. Guest board, no accounts.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'

async function freshBoard(page: Page) {
  await page.goto('/try')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
}

async function position(shape: Locator) {
  return shape.evaluate((el) => ({ x: parseFloat((el as HTMLElement).style.left), y: parseFloat((el as HTMLElement).style.top) }))
}

test('frames: name, fill, move with contents, rename, export as a section with typed notes', async ({ page }) => {
  await freshBoard(page)

  // F, then Enter on the canvas, adds a frame and opens its name for editing.
  await page.getByTestId('board-viewport').focus()
  await page.keyboard.press('f')
  await expect(page.getByTestId('tool-frame')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('shape-editor')).toBeFocused()
  await page.keyboard.type('Login page')
  await page.keyboard.press('Enter')

  const frame = page.getByTestId('shape-frame')
  await expect(frame).toBeFocused()
  await expect(frame).toHaveAccessibleName('Frame: Login page, empty')
  await expect(page.getByTestId('frame-title')).toHaveText('Login page')

  // Double-click inside the frame (it lets the click through to the canvas) adds a sticky on it.
  const box = (await frame.boundingBox())!
  await page.mouse.dblclick(box.x + 120, box.y + 150)
  await page.getByTestId('shape-editor').fill('Email form')
  await page.getByTestId('shape-editor').press('Enter')
  const sticky = page.getByTestId('shape-sticky')
  await expect(sticky).toHaveCount(1)
  await expect(frame).toHaveAccessibleName('Frame: Login page, 1 item')

  // Sticky type from the selection bar: colour plus a visible label, and in the accessible name.
  await sticky.click()
  await page.getByTestId('note-type-question').click()
  await expect(page.getByTestId('note-type-question')).toHaveAttribute('aria-pressed', 'true')
  await expect(sticky.getByTestId('note-type-badge')).toHaveText('Question')
  await expect(sticky).toHaveAccessibleName('Question sticky note: Email form')
  // Keyboard path: Y cycles the selected stickies' type.
  await sticky.focus()
  await page.keyboard.press('y')
  await expect(sticky.getByTestId('note-type-badge')).toHaveText('Decision')
  await page.keyboard.press('y')
  await page.keyboard.press('y')
  await page.keyboard.press('y')
  await expect(sticky.getByTestId('note-type-badge')).toHaveText('Question')

  // Moving the frame (keyboard, then mouse via its title) moves the sticky with it.
  const f0 = await position(frame)
  const s0 = await position(sticky)
  await frame.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => position(frame)).toEqual({ x: f0.x + 10, y: f0.y })
  await expect.poll(() => position(sticky)).toEqual({ x: s0.x + 10, y: s0.y })

  // Deselect first: on this narrow window the selection bar wraps and can sit over the title.
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('selection-bar')).toHaveCount(0)
  const title = (await page.getByTestId('frame-title').boundingBox())!
  await page.mouse.move(title.x + 10, title.y + 5)
  await page.mouse.down()
  await page.mouse.move(title.x + 60, title.y + 45, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => position(frame)).toEqual({ x: f0.x + 60, y: f0.y + 40 })
  await expect.poll(() => position(sticky)).toEqual({ x: s0.x + 60, y: s0.y + 40 })

  // Rename with F2 like any other text.
  await frame.focus()
  await page.keyboard.press('F2')
  await page.getByTestId('shape-editor').fill('Sign in')
  await page.keyboard.press('Enter')
  await expect(frame).toHaveAccessibleName('Frame: Sign in, 1 item')

  // The export: the frame is a section, the typed note is prefixed and summarised.
  await page.getByTestId('export-md').click()
  const md = page.getByTestId('export-preview')
  await expect(md).toContainText('## 1. Sign in')
  await expect(md).toContainText('- **Question:** Email form')
  await expect(md).toContainText('## Open questions')
  await expect(md).toContainText('- Email form — [1. Sign in](#1-sign-in)')
})
