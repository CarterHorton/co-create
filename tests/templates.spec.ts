/**
 * Board templates: the picker on /home and on the guest board, seeding the
 * shapes centred in view, exporting them as a spec skeleton, and never
 * seeding twice.
 *
 *   npx deepspace test run tests/templates.spec.ts
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'

/** Templates are sized for a laptop screen (see src/templates/templates.ts). */
const LAPTOP = { width: 1440, height: 900 }

/** Centre of all shapes vs centre of the board viewport, in screen px. */
async function offCentre(page: Page) {
  return page.evaluate(() => {
    const view = document.querySelector('[data-testid="board-viewport"]')!.getBoundingClientRect()
    const boxes = [...document.querySelectorAll('[data-shape-id]')]
      .filter((el) => !el.closest('[data-testid="board-arrow"]'))
      .map((el) => el.getBoundingClientRect())
    const l = Math.min(...boxes.map((b) => b.left))
    const r = Math.max(...boxes.map((b) => b.right))
    const t = Math.min(...boxes.map((b) => b.top))
    const b = Math.max(...boxes.map((x) => x.bottom))
    return {
      dx: Math.abs((l + r) / 2 - (view.left + view.width / 2)),
      dy: Math.abs((t + b) / 2 - (view.top + view.height / 2)),
      inside: l >= view.left && r <= view.right && t >= view.top && b <= view.bottom,
    }
  })
}

test('guest board: start from a template, then clear and pick another', async ({ page }) => {
  await page.setViewportSize(LAPTOP)
  await page.goto('/try')
  await expect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })

  // Empty board offers the picker; nothing opens by itself.
  await expect(page.getByTestId('template-picker')).toHaveCount(0)
  await page.getByTestId('try-template').click()
  const dialog = page.getByRole('dialog', { name: 'Start from a template' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('radio', { name: /Blank/ })).toBeChecked()

  // Keyboard: arrow keys move through the radio group.
  await dialog.getByRole('radio', { name: /Blank/ }).focus()
  await page.keyboard.press('ArrowDown') // Feature spec
  await page.keyboard.press('ArrowDown') // User story map
  await page.keyboard.press('ArrowDown') // Retro
  await expect(dialog.getByRole('radio', { name: /Retro/ })).toBeChecked()
  await dialog.getByRole('button', { name: 'Use template' }).click()
  await expect(dialog).toHaveCount(0)

  await expect(page.getByTestId('shape-sticky')).toHaveCount(6)
  await expect(page.getByTestId('shape-text')).toHaveCount(4)
  await expect(page.getByTestId('board-arrow')).toHaveCount(3)
  await expect(page.getByTestId('try-template')).toHaveCount(0)
  await expect(page.getByTestId('template-announcer')).toHaveText(/Retro template added/)
  const pos = await offCentre(page)
  expect(pos.inside).toBe(true)
  expect(pos.dx).toBeLessThan(40)
  expect(pos.dy).toBeLessThan(40)

  // Export reads as the retro's sections, in order.
  await page.getByTestId('export-md').click()
  const md = page.getByTestId('export-preview')
  await expect(md).toContainText('## 1. Went well')
  await expect(md).toContainText("## 2. Didn't go well")
  await expect(md).toContainText('## 3. Ideas')
  await expect(md).toContainText('## 4. Action items')
  await expect(md).toContainText('- What slowed us down?')
  await page.keyboard.press('Escape')

  // One undo step removes the whole template.
  await page.getByTestId('board-viewport').focus()
  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.getByTestId('shape-sticky')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect(page.getByTestId('shape-sticky')).toHaveCount(6)

  // Saved in this browser: a reload keeps it and doesn't offer the picker.
  await page.reload()
  await expect(page.getByTestId('shape-sticky')).toHaveCount(6, { timeout: 15_000 })
  await expect(page.getByTestId('try-template')).toHaveCount(0)

  // Clearing offers the picker straight away.
  await page.getByTestId('try-clear').click()
  await page.getByRole('button', { name: 'Clear board' }).click()
  const again = page.getByRole('dialog', { name: 'Start from a template' })
  await expect(again).toBeVisible()
  await again.getByTestId('template-option-feature-spec').click()
  await again.getByRole('button', { name: 'Use template' }).click()
  await expect(page.getByTestId('shape-sticky')).toHaveCount(12)
  await expect(page.getByTestId('shape-text')).toHaveCount(6)
  await page.screenshot({ path: 'test-results/templates-feature-spec.png' })
})

test.describe('signed in', () => {
  test.skip(loadAllTestAccounts().length < 1, 'Needs a test account.')

  test('a new board starts from the chosen template, seeded once', async ({ users }) => {
    const [a] = await users(1)
    const page = a.page
    await page.setViewportSize(LAPTOP)
    await page.goto('/home')
    const title = `Template board ${Date.now()}`
    await page.getByTestId('board-title-input').fill(title)

    await expect(page.getByTestId('template-choose')).toHaveAccessibleName(/Template: Blank/)
    await page.getByTestId('template-choose').click()
    const dialog = page.getByRole('dialog', { name: 'Choose a template' })
    await dialog.getByRole('radio', { name: /API design/ }).check()
    await dialog.getByRole('button', { name: 'Choose' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('template-choose')).toHaveAccessibleName(/Template: API design/)
    // Choosing didn't submit the create form.
    await expect(page.getByTestId('boards-page')).toBeVisible()

    await page.getByTestId('board-create').click()
    await expect(page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('board-connection')).toHaveText(/Live/, { timeout: 15_000 })
    await expect(page.getByTestId('shape-sticky')).toHaveCount(13, { timeout: 15_000 })
    await expect(page.getByTestId('shape-text')).toHaveCount(6)
    await expect(page.getByTestId('board-arrow')).toHaveCount(5)
    await page.screenshot({ path: 'test-results/templates-api-design.png' })
    const pos = await offCentre(page)
    expect(pos.dx).toBeLessThan(40)
    expect(pos.dy).toBeLessThan(40)

    await page.getByTestId('export-md').click()
    const md = page.getByTestId('export-preview')
    await expect(md).toContainText('## 1. Overview')
    await expect(md).toContainText('## 3. Endpoints')
    await expect(md).toContainText('## 6. Open questions')
    await page.keyboard.press('Escape')

    // A reload (or a second tab) never seeds a second copy.
    await page.reload()
    await expect(page.getByTestId('board-connection')).toHaveText(/Live/, { timeout: 15_000 })
    await page.waitForTimeout(1500)
    await expect(page.getByTestId('shape-sticky')).toHaveCount(13)
    const second = await page.context().newPage()
    await second.goto(page.url())
    await expect(second.getByTestId('board-connection')).toHaveText(/Live/, { timeout: 15_000 })
    await second.waitForTimeout(1500)
    await expect(second.getByTestId('shape-sticky')).toHaveCount(13)
    await second.close()

    // The choice resets to Blank for the next board; clean up this one.
    await page.goto('/home')
    await expect(page.getByTestId('template-choose')).toHaveAccessibleName(/Template: Blank/)
    await page.getByRole('button', { name: `Delete ${title}` }).click()
    await page.getByRole('button', { name: 'Delete board' }).click()
    await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0, { timeout: 15_000 })
  })
})
