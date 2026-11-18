/**
 * Boards are private, so a multi-user spec must befriend its two accounts and
 * send the board before the second one can open it.
 */
import { expect, type Page } from '@playwright/test'

interface Party {
  page: Page
}

/** B's display name as the app shows it (name || email) — what A's friend list stores. */
export async function displayName(page: Page): Promise<string> {
  await expect(page.getByTestId('nav-user-name')).toHaveText(/\S/, { timeout: 15_000 })
  return ((await page.getByTestId('nav-user-name').textContent()) ?? '').trim()
}

/** Make A and B friends with a fresh friend code. Both pages end on /home. */
export async function befriend(a: Party, b: Party): Promise<void> {
  await Promise.all([a.page.goto('/home'), b.page.goto('/home')])
  await a.page.getByTestId('friend-code-create').click()
  const code = ((await a.page.getByTestId('friend-code').textContent()) ?? '').trim()
  await b.page.getByTestId('friend-code-input').fill(code)
  await b.page.getByTestId('friend-code-redeem').click()
  await expect(b.page.getByText(/joined your party/)).toBeVisible({ timeout: 15_000 })
}

/** Send the board at `boardUrl` from its owner A to B. A ends on the board. */
export async function shareBoard(a: Party, b: Party, boardUrl: string): Promise<void> {
  await befriend(a, b)
  const bName = await displayName(b.page)
  await a.page.goto(boardUrl)
  await a.page.getByTestId('share-open').click()
  const menu = a.page.getByTestId('share-menu')
  await menu.getByRole('listitem').filter({ hasText: bName }).getByRole('button', { name: 'Send' }).click()
  await expect(menu.getByRole('listitem').filter({ hasText: bName }).getByRole('button', { name: /Revoke/ })).toBeVisible({
    timeout: 15_000,
  })
  await a.page.keyboard.press('Escape')
}
