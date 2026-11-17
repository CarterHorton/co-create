/**
 * Phase 1 acceptance: two signed-in users edit the same board live.
 *
 * Needs two test accounts (see collab.spec.ts for how to create them):
 *   npx deepspace test run board
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

test.skip(loadAllTestAccounts().length < 2, 'Needs 2 usable test accounts — see collab.spec.ts.')

test('a sticky added by one user appears, moves, and updates for the other', async ({ users }) => {
  const [a, b] = await users(2)

  // A creates a board.
  await a.page.goto('/home')
  const title = `Spec board ${Date.now()}`
  await a.page.getByTestId('board-title-input').fill(title)
  await a.page.getByTestId('board-create').click()
  await expect(a.page.getByTestId('board-page')).toBeVisible({ timeout: 15_000 })
  const boardUrl = a.page.url()

  // B opens the same board.
  await b.page.goto(boardUrl)
  await expect(b.page.getByTestId('board-connection')).toHaveText(/Live/, { timeout: 15_000 })
  await expect(a.page.getByTestId('board-connection')).toHaveText(/Live/, { timeout: 15_000 })

  // A double-clicks to add a sticky and types into it.
  const viewport = a.page.getByTestId('board-viewport')
  await viewport.dblclick({ position: { x: 300, y: 300 } })
  const editor = a.page.getByTestId('shape-editor')
  await expect(editor).toBeVisible({ timeout: 10_000 })
  await editor.fill('Ship the onboarding flow')
  await editor.press('Escape')

  // B sees it, with the text.
  const bSticky = b.page.getByTestId('shape-sticky')
  await expect(bSticky).toHaveCount(1, { timeout: 10_000 })
  await expect(bSticky).toContainText('Ship the onboarding flow', { timeout: 10_000 })

  // A drags it; B sees the new position.
  const aSticky = a.page.getByTestId('shape-sticky')
  const before = await bSticky.boundingBox()
  const box = await aSticky.boundingBox()
  if (!before || !box) throw new Error('sticky not laid out')
  await a.page.mouse.move(box.x + 20, box.y + 20)
  await a.page.mouse.down()
  await a.page.mouse.move(box.x + 170, box.y + 120, { steps: 8 })
  await a.page.mouse.up()
  await expect
    .poll(async () => (await bSticky.boundingBox())?.x ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(before.x + 100)

  // A's own view kept the move too (optimistic local state).
  expect((await aSticky.boundingBox())!.x).toBeGreaterThan(box.x + 100)

  // A adds a box and connects the sticky to it with an arrow; B sees the arrow.
  await a.page.getByTestId('tool-box').click()
  await viewport.click({ position: { x: 700, y: 250 } })
  await expect(a.page.getByTestId('shape-editor')).toBeVisible({ timeout: 10_000 })
  await a.page.getByTestId('shape-editor').fill('Auth service')
  await a.page.getByTestId('shape-editor').press('Escape')
  await expect(b.page.getByTestId('shape-box')).toContainText('Auth service', { timeout: 10_000 })
  await a.page.getByTestId('tool-arrow').click()
  await aSticky.click()
  await a.page.getByTestId('shape-box').click()
  await expect(b.page.getByTestId('board-arrow')).toHaveCount(1, { timeout: 10_000 })

  // B sees A's live cursor.
  await a.page.mouse.move(500, 450, { steps: 5 })
  await expect(b.page.getByTestId('peer-cursor')).toHaveCount(1, { timeout: 10_000 })

  await b.page.screenshot({ path: 'test-results/board-two-users.png' })
})
