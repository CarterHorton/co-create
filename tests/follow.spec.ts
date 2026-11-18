/**
 * Follow mode: B clicks A's avatar and follows A's view; A pans, B's camera
 * follows; Escape stops it, after which A's panning no longer moves B.
 * Run: npx deepspace test run tests/follow.spec.ts
 */
import { test, expect, loadAllTestAccounts, type Page } from 'deepspace/testing'
import { shareBoard } from './helpers/share'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts — see collab.spec.ts.')

/** The board camera, read from the world layer's transform. */
async function camera(page: Page) {
  const t = await page.getByTestId('board-viewport').locator(':scope > div').first().evaluate((el) => (el as HTMLElement).style.transform)
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(t)
  if (!m) throw new Error(`unexpected transform: ${t}`)
  return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) }
}

/** Pan with the keyboard on the canvas: Shift+arrow moves 200px. */
async function pan(page: Page, key: string, times: number) {
  await page.getByTestId('board-viewport').focus()
  for (let i = 0; i < times; i++) await page.keyboard.press(`Shift+${key}`)
}

test('B follows A, tracks A panning, and Escape stops following', async ({ users }) => {
  test.setTimeout(90_000)
  const [a, b] = await users(2)

  await a.page.goto('/home')
  await a.page.getByTestId('board-title-input').fill(`Follow board ${Date.now()}`)
  await a.page.getByTestId('board-create').click()
  await expect(a.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
  await shareBoard(a, b, a.page.url())
  await expect(a.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
  await b.page.goto(a.page.url())
  await expect(b.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })

  // B sees A's avatar as a "Follow …" button and clicks it.
  const avatar = b.page.getByTestId('follow-avatar')
  await expect(avatar).toHaveCount(1, { timeout: 20_000 })
  await expect(avatar).toHaveAttribute('aria-label', /^Follow /)
  await avatar.click()
  await expect(avatar).toHaveAttribute('aria-pressed', 'true')
  const banner = b.page.getByTestId('follow-banner')
  await expect(banner).toContainText('Following')
  await expect(banner.getByRole('button', { name: /Stop following/ })).toBeVisible()
  await expect(b.page.getByTestId('board-announcer')).toContainText('Following', { timeout: 5_000 })

  // A pans; B's camera ends up where A's is (same window size, so the same camera).
  await pan(a.page, 'ArrowRight', 3)
  await pan(a.page, 'ArrowDown', 2)
  const aCam = await camera(a.page)
  expect(aCam.x).toBe(-600)
  expect(aCam.y).toBe(-400)
  await expect
    .poll(async () => {
      const c = await camera(b.page)
      return Math.abs(c.x - aCam.x) < 2 && Math.abs(c.y - aCam.y) < 2 && Math.abs(c.zoom - aCam.zoom) < 0.01
    }, { timeout: 15_000 })
    .toBe(true)

  // Escape stops following.
  await b.page.getByTestId('board-viewport').focus()
  await b.page.keyboard.press('Escape')
  await expect(banner).toBeHidden()
  await expect(avatar).toHaveAttribute('aria-pressed', 'false')
  await expect(b.page.getByTestId('board-announcer')).toContainText('Stopped following', { timeout: 5_000 })

  // A pans on; B stays put.
  const bCam = await camera(b.page)
  await pan(a.page, 'ArrowLeft', 2)
  await b.page.waitForTimeout(1_000)
  expect(await camera(b.page)).toEqual(bCam)
})
