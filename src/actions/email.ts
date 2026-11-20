/**
 * Email preferences for the signed-in user (Settings → Email notifications).
 *
 *   emailPrefsGet → {}                       — { subscribed, email }
 *   emailPrefsSet → { subscribed: boolean }  — take your address off, or put
 *                                              it on, the no-email list
 *
 * The same list is what an unsubscribe link adds to (unsubscribeByToken,
 * used by the public POST /api/email/unsubscribe in src/server/http-routes.ts).
 */

import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { isSuppressed, setSuppressed } from '../email/notify'
import { normalizeLinkToken } from './linkTokens'

const fail = (error: string, code?: string): ActionResult => ({ success: false, error, code })

async function ownEmail(tools: ActionTools, userId: string): Promise<string | null> {
  const res = await tools.get<{ email?: string }>('users', userId)
  const email = res.success ? res.data.record.data.email?.trim() : undefined
  return email && email.includes('@') ? email : null
}

const emailPrefsGet: ActionHandler<Env> = async ({ userId, tools }) => {
  const email = await ownEmail(tools, userId)
  if (!email) return { success: true, data: { subscribed: false, email: null } }
  return { success: true, data: { subscribed: !(await isSuppressed(tools, email)), email } }
}

const emailPrefsSet: ActionHandler<Env> = async ({ userId, params, tools }) => {
  if (typeof params.subscribed !== 'boolean') return fail('Missing choice.', 'bad_request')
  const email = await ownEmail(tools, userId)
  if (!email) return fail('Your account has no email address.', 'no_email')
  try {
    await setSuppressed(tools, email, !params.subscribed)
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
  return { success: true, data: { subscribed: params.subscribed } }
}

/**
 * Unsubscribe the person an email was sent to, from the token in its link.
 * No sign-in needed: holding the 128-bit token is the proof. Safe to repeat.
 */
export async function unsubscribeByToken(tools: ActionTools, raw: unknown): Promise<ActionResult> {
  const token = normalizeLinkToken(raw)
  if (!token) return fail('This unsubscribe link is not valid.', 'bad_token')
  const prefs = await tools.query<{ userId: string }>('email_prefs', { where: { token }, limit: 1 })
  const owner = prefs.success ? prefs.data.records[0]?.data.userId : undefined
  if (!owner) return fail('This unsubscribe link is no longer valid. You may have deleted your account.', 'bad_token')
  const email = await ownEmail(tools, owner)
  if (!email) return fail('This unsubscribe link is no longer valid.', 'bad_token')
  await setSuppressed(tools, email, true)
  return { success: true, data: {} }
}

export const emailActions: Record<string, ActionHandler<Env>> = {
  emailPrefsGet,
  emailPrefsSet,
}
