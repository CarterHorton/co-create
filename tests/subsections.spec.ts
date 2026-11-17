/**
 * Subsections: split a named section into parts (Front-end › Login page,
 * Dashboard) from the selection bar; the overlay outlines each part and the
 * export writes each as a ### heading. Guest board, no accounts needed.
 */
import { test, expect, type Page } from '@playwright/test'

async function addSticky(page: Page, x: number, y: number, text: string) {
  await page.getByTestId('board-viewport').dblclick({ position: { x, y } })
  const editor = page.getByTestId('shape-editor')
  await editor.fill(text)
  await editor.press('Enter')
}

const stickyByText = (page: Page, text: string) => page.getByTestId('shape-sticky').filter({ hasText: text })

async function assign(page: Page, notes: string[], section: string, subsection: string) {
  await stickyByText(page, notes[0]).click()
  for (const n of notes.slice(1)) await stickyByText(page, n).click({ modifiers: ['Shift'] })
  await expect(page.getByTestId('selection-count')).toHaveText(`${notes.length} selected`)
  await page.getByTestId('section-name-input').fill(section)
  await page.getByTestId('subsection-name-input').fill(subsection)
  await page.getByTestId('section-assign').click()
}

test('assign notes to subsections, see them outlined and exported as ### headings', async ({ page }) => {
  await page.goto('/try')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })

  await addSticky(page, 200, 250, 'Email form')
  await addSticky(page, 200, 480, 'Forgot password')
  await addSticky(page, 450, 250, 'Usage chart')

  // The subsection field needs a section first.
  await stickyByText(page, 'Email form').click()
  await expect(page.getByTestId('subsection-name-input')).toBeDisabled()

  await assign(page, ['Email form', 'Forgot password'], 'Front-end', 'Login page')
  await expect(stickyByText(page, 'Email form').getByTestId('shape-section-tag')).toHaveText('Front-end › Login page')
  await assign(page, ['Usage chart'], 'Front-end', 'Dashboard')
  await expect(stickyByText(page, 'Usage chart').getByTestId('shape-section-tag')).toHaveText('Front-end › Dashboard')

  // One section, two subsection outlines.
  await page.getByTestId('toggle-sections').click()
  await expect(page.getByTestId('section-outline')).toHaveCount(1)
  await expect(page.getByTestId('subsection-outline')).toHaveCount(2)
  await expect(page.getByTestId('subsection-outline').first()).toContainText('1.1 Login page')

  await page.getByTestId('export-md').click()
  const md = page.getByTestId('export-preview')
  await expect(md).toContainText('## 1. Front-end')
  await expect(md).toContainText('### 1.1 Login page\n\n- Email form\n- Forgot password')
  await expect(md).toContainText('### 1.2 Dashboard\n\n- Usage chart')
  await page.keyboard.press('Escape')

  // Ungroup clears the subsection with the section.
  await page.getByTestId('toggle-sections').click()
  await stickyByText(page, 'Usage chart').click()
  await page.getByTestId('section-remove').click()
  await expect(stickyByText(page, 'Usage chart').getByTestId('shape-section-tag')).toHaveCount(0)
})
