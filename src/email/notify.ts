/**
 * Transactional email through DeepSpace's `email/send` integration (billed to
 * the app owner: src/integrations.ts). Two notices, both about something done
 * *to* the recipient:
 *
 *   friend — someone used your friend code and joined your party;
 *   board  — someone shared a board (or a project of boards) with you.
 *
 * Every email carries an unsubscribe link (/unsubscribe?t=…). Unsubscribing
 * puts the address on the no-email list (email_suppressions), which is checked
 * before every send. Sending never fails the action that triggered it: a
 * notice is a courtesy, the share itself already happened.
 *
 * Spend is capped per sender (DAILY_CAP) so nobody can drain the app's
 * credits by sharing over and over.
 */

import type { ActionTools } from 'deepspace/worker'
import { hashLinkToken, newLinkToken } from '../actions/linkTokens'

/** Emails one person can cause per rolling 24 hours. */
export const DAILY_CAP = 20
const DAY_MS = 24 * 60 * 60_000

/** RFC 2606 / 6761 names that never receive mail (test accounts use them): sending would only spend credits. */
const UNDELIVERABLE = /\.(test|example|invalid|localhost)$/i

/**
 * The app's own origin, for links in emails: the origin of the request that
 * caused the email (action-routes.ts sets REQUEST_ORIGIN), else the deployed
 * *.app.space address. Never taken from client params: a caller could
 * otherwise point the links in an email we send at a site of their choosing.
 */
export function appOrigin(env: { REQUEST_ORIGIN?: string; APP_NAME: string }): string {
  return env.REQUEST_ORIGIN || `https://${env.APP_NAME}.app.space`
}

export type Notice =
  | { kind: 'friend'; fromName: string }
  | { kind: 'board'; fromName: string; boardTitle: string; boardId: string }
  | { kind: 'project'; fromName: string; projectName: string; boards: number }

export interface Email {
  subject: string
  text: string
  html: string
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Names and titles are user-written: one line, bounded, so a subject can't be stuffed. */
const clean = (s: string, max = 80) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > max ? `${one.slice(0, max - 1)}…` : one || 'Someone'
}

/** The email for a notice. `origin` is the app's own origin; `token` the recipient's unsubscribe token. */
export function renderNotice(n: Notice, origin: string, token: string): Email {
  const from = clean(n.fromName)
  const unsubscribe = `${origin}/unsubscribe?t=${encodeURIComponent(token)}`
  let subject: string
  let line: string
  let cta: { label: string; url: string }
  if (n.kind === 'friend') {
    subject = `${from} added you as a friend on Co-Create`
    line = `${from} used your friend code and joined your party on Co-Create. You can now send each other boards.`
    cta = { label: 'Open Co-Create', url: `${origin}/home` }
  } else if (n.kind === 'board') {
    const title = clean(n.boardTitle, 120)
    subject = `${from} shared “${title}” with you`
    line = `${from} shared the board “${title}” with you on Co-Create.`
    cta = { label: 'Open the board', url: `${origin}/board/${encodeURIComponent(n.boardId)}` }
  } else {
    const name = clean(n.projectName, 120)
    const boards = n.boards === 1 ? '1 board' : `${n.boards} boards`
    subject = `${from} shared the project “${name}” with you`
    line = `${from} shared the project “${name}” (${boards}) with you on Co-Create.`
    cta = { label: 'Open Co-Create', url: `${origin}/home` }
  }
  const footer = "You're getting this because someone did this on Co-Create. Don't want these emails?"
  const text = `${line}\n\n${cta.label}: ${cta.url}\n\n—\n${footer} Unsubscribe: ${unsubscribe}\n`
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0a0a0a;max-width:520px">',
    `<p>${escapeHtml(line)}</p>`,
    `<p><a href="${escapeHtml(cta.url)}" style="display:inline-block;border:1px solid #0a0a0a;padding:10px 18px;color:#0a0a0a;text-decoration:none;font-weight:bold">${escapeHtml(cta.label)}</a></p>`,
    `<p style="margin-top:32px;font-size:12px;color:#6b6b6b">${escapeHtml(footer)} <a href="${escapeHtml(unsubscribe)}" style="color:#6b6b6b">Unsubscribe</a></p>`,
    '</div>',
  ].join('')
  return { subject, text, html }
}

/** Hash used for the no-email list: trimmed, lower-cased address. */
export const emailHash = (email: string) => hashLinkToken(email.trim().toLowerCase())

/** Is this address on the no-email list? */
export async function isSuppressed(tools: ActionTools, email: string): Promise<boolean> {
  const res = await tools.query('email_suppressions', { where: { emailHash: await emailHash(email) }, limit: 1 })
  return res.success && res.data.records.length > 0
}

/** Put an address on, or take it off, the no-email list. Idempotent. */
export async function setSuppressed(tools: ActionTools, email: string, suppressed: boolean): Promise<void> {
  const hash = await emailHash(email)
  if (suppressed) {
    if (await isSuppressed(tools, email)) return
    const res = await tools.create('email_suppressions', { emailHash: hash, at: Date.now() })
    if (!res.success && !/unique|exists/i.test(res.error)) throw new Error(res.error)
  } else {
    const res = await tools.deleteWhere('email_suppressions', { emailHash: hash })
    if (!res.success) throw new Error(res.error)
  }
}

/** The recipient's unsubscribe token, made on first use. */
async function unsubscribeToken(tools: ActionTools, userId: string): Promise<string> {
  const found = await tools.query<{ token: string }>('email_prefs', { where: { userId }, limit: 1 })
  if (!found.success) throw new Error(found.error)
  const existing = found.data.records[0]?.data.token
  if (existing) return existing
  const token = newLinkToken()
  const res = await tools.create('email_prefs', { userId, token })
  if (!res.success) {
    // Another send made one first: use theirs.
    const again = await tools.query<{ token: string }>('email_prefs', { where: { userId }, limit: 1 })
    const t = again.success ? again.data.records[0]?.data.token : undefined
    if (t) return t
    throw new Error(res.error)
  }
  return token
}

export type SendOutcome = 'sent' | 'no_email' | 'undeliverable' | 'unsubscribed' | 'capped' | 'failed'

/**
 * Email `recipientId` about `notice`, caused by `senderId`. Never throws; says
 * what happened so callers (and tests) can tell a skip from a send.
 */
export async function sendNotice(
  tools: ActionTools,
  opts: { senderId: string; recipientId: string; origin: string; notice: Notice; now?: number },
): Promise<SendOutcome> {
  try {
    const now = opts.now ?? Date.now()
    const user = await tools.get<{ email?: string }>('users', opts.recipientId)
    const to = user.success ? user.data.record.data.email?.trim() : undefined
    if (!to || !to.includes('@')) return 'no_email'
    if (UNDELIVERABLE.test(to)) return 'undeliverable'
    if (await isSuppressed(tools, to)) return 'unsubscribed'

    const log = await tools.query<{ at: number }>('email_log', { where: { senderId: opts.senderId }, limit: 200 })
    const rows = log.success ? log.data.records : []
    if (rows.filter((r) => r.data.at > now - DAY_MS).length >= DAILY_CAP) return 'capped'
    // Keep the log small: drop this sender's entries older than a day.
    for (const old of rows.filter((r) => r.data.at <= now - DAY_MS)) await tools.remove('email_log', old.recordId)

    const token = await unsubscribeToken(tools, opts.recipientId)
    const email = renderNotice(opts.notice, opts.origin, token)
    await tools.create('email_log', { senderId: opts.senderId, at: now })
    const res = await tools.integration('email/send', { to, subject: email.subject, text: email.text, html: email.html })
    if (!res.success) {
      console.error(`[email] send failed: ${res.error}`)
      return 'failed'
    }
    return 'sent'
  } catch (err) {
    console.error(`[email] ${err instanceof Error ? err.message : String(err)}`)
    return 'failed'
  }
}
