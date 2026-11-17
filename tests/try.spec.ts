/**
 * Guest mode: a board that lives only in this browser, with arrow styles and
 * Markdown export. No accounts needed.
 */
import { test, expect } from '@playwright/test'

test('guest board saves locally, reshapes arrows, and exports Markdown', async ({ page }) => {
  const canvasSockets: string[] = []
  page.on('websocket', (ws) => {
    if (/\/ws\/(canvas|presence)\//.test(ws.url())) canvasSockets.push(ws.url())
  })

  await page.goto('/home')
  await page.getByTestId('try-link').click()
  await expect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('call-rail')).toHaveCount(0)
  await page.getByTestId('try-title').fill('Guest plan')

  const viewport = page.getByTestId('board-viewport')
  const editor = page.getByTestId('shape-editor')

  // Two notes far apart → two sections.
  await viewport.dblclick({ position: { x: 250, y: 300 } })
  await editor.fill('Design the login page')
  await editor.press('Escape')
  await viewport.dblclick({ position: { x: 750, y: 300 } })
  await editor.fill('Build the API')
  await editor.press('Escape')
  await expect(page.getByTestId('shape-sticky')).toHaveCount(2)

  // Curved arrow between them, then drag its handle.
  await page.getByTestId('route-curve').click()
  await page.getByTestId('tool-arrow').click()
  await page.getByTestId('shape-sticky').nth(0).click()
  await page.getByTestId('shape-sticky').nth(1).click()
  const arrow = page.getByTestId('board-arrow')
  await expect(arrow).toHaveAttribute('data-route', 'curve')
  // Click a point that is actually on the (curved) line, not its bbox centre.
  const mid = await arrow.locator('path').first().evaluate((el: SVGPathElement) => {
    const p = el.getPointAtLength(el.getTotalLength() / 2)
    const m = el.getScreenCTM()!
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f }
  })
  await page.mouse.click(mid.x, mid.y)
  const handle = page.getByTestId('arrow-bend-handle')
  await expect(handle).toBeVisible()
  const before = await arrow.locator('path').first().getAttribute('d')
  const hb = (await handle.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x, hb.y + 120, { steps: 6 })
  await page.mouse.up()
  expect(await arrow.locator('path').first().getAttribute('d')).not.toBe(before)

  // Switch the selected arrow to elbow.
  await page.getByTestId('route-elbow').click()
  await expect(arrow).toHaveAttribute('data-route', 'elbow')

  // Survives a reload — from localStorage.
  await page.reload()
  await expect(page.getByTestId('shape-sticky')).toHaveCount(2, { timeout: 15_000 })
  await expect(page.getByTestId('board-arrow')).toHaveAttribute('data-route', 'elbow')
  await expect(page.getByTestId('try-title')).toHaveValue('Guest plan')

  // Sections overlay matches the export's grouping.
  await page.getByTestId('toggle-sections').click()
  const outlines = page.getByTestId('section-outline')
  await expect(outlines).toHaveCount(2)
  await expect(outlines.first()).toContainText('1. Design the login page')
  await page.screenshot({ path: 'test-results/try-board.png' })

  // Export.
  await page.getByTestId('export-md').click()
  const md = page.getByTestId('export-preview')
  await expect(md).toContainText('# Guest plan')
  await expect(md).toContainText('## 1. Design the login page')
  await expect(md).toContainText('## 2. Build the API')
  await expect(md).toContainText('_Comes after: [1. Design the login page](#1-design-the-login-page)_')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()])
  expect(download.suggestedFilename()).toBe('guest-plan.md')
  await page.screenshot({ path: 'test-results/try-export.png' })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('export-preview')).toHaveCount(0)

  // Drag the second note next to the first: one section now.
  const second = page.getByTestId('shape-sticky').nth(1)
  const first = (await page.getByTestId('shape-sticky').nth(0).boundingBox())!
  const sb = (await second.boundingBox())!
  await page.mouse.move(sb.x + 20, sb.y + 20)
  await page.mouse.down()
  await page.mouse.move(first.x + first.width + 40, first.y + 20, { steps: 10 })
  await page.mouse.up()
  await expect(outlines).toHaveCount(1)

  // Nothing went to the shared canvas / presence rooms.
  expect(canvasSockets).toEqual([])
})
