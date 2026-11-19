/**
 * Database schema builder, in a guest board (no accounts): entity tables,
 * relations with cardinality, the Markdown "Data model" section and the
 * SQL / Prisma export.
 */
import { test, expect } from '@playwright/test'

test('draw tables, relate them, and export SQL', async ({ page }) => {
  await page.goto('/home')
  await page.getByTestId('try-link').click()
  await expect(page.getByTestId('try-page')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('try-title').fill('Shop')

  const viewport = page.getByTestId('board-viewport')
  const dialog = page.getByTestId('entity-dialog')
  const tables = page.getByTestId('shape-entity')

  // A table from the keyboard: D, then Enter on the canvas opens its editor.
  await viewport.focus()
  await page.keyboard.press('d')
  await expect(page.getByTestId('tool-entity')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await page.getByTestId('entity-name-input').fill('users')
  await page.getByTestId('entity-add-field').click()
  const rows = dialog.getByTestId('entity-field-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(1).getByTestId('field-name')).toBeFocused()
  await page.keyboard.type('email')
  await rows.nth(1).getByTestId('field-type').selectOption('text')
  await rows.nth(1).getByRole('checkbox', { name: 'email required (NOT NULL)' }).click()
  await rows.nth(1).getByRole('checkbox', { name: 'email unique' }).click()
  // Reorder by keyboard: move email above id.
  await rows.nth(1).getByRole('button', { name: 'Move email up' }).focus()
  await page.keyboard.press('Enter')
  await expect(rows.nth(0).getByTestId('field-name')).toHaveValue('email')
  await page.getByTestId('entity-save').click()
  await expect(dialog).toHaveCount(0)

  const users = tables.first()
  await expect(users).toHaveAttribute('aria-label', 'Entity users, 2 fields')
  await expect(users).toBeFocused()
  await expect(users.getByTestId('entity-field').nth(0)).toContainText('email')
  await expect(users.getByTestId('entity-field').nth(0)).toContainText('req')
  await expect(users.getByTestId('entity-field').nth(1)).toContainText('PK')

  // Enter on the table reopens the editor, with the fields as saved.
  await page.keyboard.press('Enter')
  await expect(dialog).toBeVisible()
  await expect(rows.nth(0).getByTestId('field-name')).toHaveValue('email')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // A second table with the pointer, away from the first.
  const box = (await users.boundingBox())!
  const vp = (await viewport.boundingBox())!
  await page.getByTestId('tool-entity').click()
  await viewport.click({ position: { x: Math.max(150, box.x - vp.x - 250), y: box.y - vp.y + box.height + 140 } })
  await expect(dialog).toBeVisible()
  await page.getByTestId('entity-name-input').fill('orders')
  await page.getByTestId('entity-save').click()
  await expect(tables).toHaveCount(2)
  const orders = page.getByRole('button', { name: 'Entity orders, 1 field' })
  await expect(orders).toBeVisible()
  // Focus that follows a pointer press on the canvas within 500 ms counts as a click, not keyboard focus.
  await page.waitForTimeout(600)

  // Connect them from the keyboard (C on the focused table): a one-to-many relation by default.
  await users.focus()
  await page.keyboard.press('c')
  await page.getByTestId('connect-option').filter({ hasText: 'Entity orders' }).click()
  const relation = page.getByTestId('board-arrow')
  await expect(relation).toHaveAttribute('aria-label', 'Relation from users to orders, one to many')
  await expect(page.getByTestId('relation-end')).toHaveText(['1', '∗'])

  // Tab to it (tables first, arrows last): the bar sets the cardinality.
  await expect(users).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(orders).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(relation).toBeFocused()
  const bar = page.getByTestId('relation-bar')
  await expect(bar).toBeVisible()
  await page.getByTestId('cardinality-n-n').click()
  await expect(relation).toHaveAttribute('aria-label', 'Relation from users to orders, many to many')
  await expect(page.getByTestId('relation-end')).toHaveText(['∗', '∗'])

  // Keyboard: Enter on the relation jumps to the picker, arrows move, Escape returns.
  await relation.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('cardinality-n-n')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('cardinality-1-n')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(relation).toHaveAttribute('aria-label', 'Relation from users to orders, one to many')
  await page.keyboard.press('Escape')
  await expect(relation).toBeFocused()

  // Survives a reload (guest boards live in localStorage).
  await page.reload()
  await expect(page.getByTestId('shape-entity')).toHaveCount(2)
  await expect(page.getByTestId('relation-end')).toHaveText(['1', '∗'])

  // Export: a Data model section in the Markdown, and SQL / Prisma.
  await page.getByTestId('export-md').click()
  const md = page.getByTestId('export-preview')
  await expect(md).toContainText('## Data model')
  await expect(md).toContainText('| email | text | — | yes | yes |')
  await expect(md).toContainText('- users 1 → ∗ orders')
  const schema = page.getByTestId('schema-preview')
  await expect(schema).toContainText('CREATE TABLE "users" (')
  await expect(schema).toContainText('"email" TEXT NOT NULL UNIQUE')
  await expect(schema).toContainText('ALTER TABLE "orders" ADD FOREIGN KEY ("user_id") REFERENCES "users" ("id");')
  const download = page.waitForEvent('download')
  await page.getByTestId('schema-download').click()
  expect((await download).suggestedFilename()).toBe('shop-schema.sql')
  await page.getByTestId('schema-format-prisma').click()
  await expect(schema).toContainText('model Users {')
  await expect(schema).toContainText('@relation("orders.user_id"')
})
