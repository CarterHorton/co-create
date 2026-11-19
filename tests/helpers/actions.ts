import type { Page } from '@playwright/test'

/** Call a server action as the user signed in on `page` (bypassing the UI, to test server checks). */
export async function callAction(
  page: Page,
  name: string,
  params: Record<string, unknown>,
): Promise<{ success: boolean; code?: string; error?: string; data?: unknown }> {
  return page.evaluate(
    async ({ name, params }) => {
      const { token } = (await (await fetch('/api/auth/token', { method: 'POST', credentials: 'include' })).json()) as { token: string }
      const res = await fetch(`/api/actions/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(params),
      })
      return (await res.json()) as { success: boolean; code?: string; error?: string; data?: unknown }
    },
    { name, params },
  )
}
