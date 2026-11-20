/**
 * Email notifications: the Settings switch, the public unsubscribe page, and
 * the browser being unable to send email (or use any owner-paid integration)
 * directly. The test accounts use @*.test addresses, which the app never
 * mails, so nothing here spends credits.
 */
import { test, expect } from 'deepspace/testing'

test('turning email notifications off and on in Settings sticks', async ({ users }) => {
  const [a] = await users(1)
  await a.page.goto('/settings')
  const toggle = a.page.getByTestId('email-notifications')
  await expect(toggle).toBeEnabled({ timeout: 15_000 })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await expect(a.page.getByTestId('email-settings')).toContainText('Sent to')

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await a.page.reload()
  await expect(a.page.getByTestId('email-notifications')).toHaveAttribute('aria-checked', 'false', { timeout: 15_000 })

  await a.page.getByTestId('email-notifications').click()
  await expect(a.page.getByTestId('email-notifications')).toHaveAttribute('aria-checked', 'true')
  await a.page.reload()
  await expect(a.page.getByTestId('email-notifications')).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 })
})

test('the unsubscribe page asks before acting and rejects a bad link', async ({ page }) => {
  await page.goto('/unsubscribe?t=AAAAAAAAAAAAAAAAAAAAAA')
  await expect(page.getByRole('heading', { name: 'Unsubscribe from emails' })).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('unsubscribe-confirm').click()
  await expect(page.getByRole('alert')).toContainText('no longer valid')

  await page.goto('/unsubscribe')
  await expect(page.getByRole('alert')).toContainText('missing its code')
})

test('the browser cannot send email or call integrations the app owner pays for', async ({ users }) => {
  const [a] = await users(1)
  await a.page.goto('/home')
  const status = (name: string) =>
    a.page.evaluate(async (name) => {
      const { token } = (await (await fetch('/api/auth/token', { method: 'POST', credentials: 'include' })).json()) as { token: string }
      const res = await fetch(`/api/integrations/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: 'someone@example.com', subject: 'x', text: 'x' }),
      })
      return res.status
    }, name)
  expect(await status('email/send')).toBe(403)
  expect(await status('anthropic/chat-completion')).toBe(403)
})
