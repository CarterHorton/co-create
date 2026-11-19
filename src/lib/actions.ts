/** Call a server action from src/actions (POST /api/actions/:name) as the signed-in user. */

import { getAuthToken } from 'deepspace'

/** `keepalive`: let the request finish even if the page is closing (e.g. from a pagehide handler). */
export async function callAction<T = unknown>(
  name: string,
  params: Record<string, unknown> = {},
  opts: { keepalive?: boolean } = {},
): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new Error('Sign in first.')
  const res = await fetch(`/api/actions/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
    keepalive: opts.keepalive,
  })
  const body = (await res.json().catch(() => null)) as { success?: boolean; data?: T; error?: string } | null
  if (!res.ok || !body?.success) throw new Error(body?.error || `Request failed (${res.status})`)
  return body.data as T
}
