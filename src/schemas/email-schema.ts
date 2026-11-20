/**
 * Email notifications (src/email/notify.ts) — all server-only.
 *
 *   email_prefs        — one per user: the random token in their unsubscribe
 *                        links. Created the first time they're emailed.
 *   email_suppressions — the no-email list. Keyed by a SHA-256 hash of the
 *                        address, not the address itself, so it can outlive
 *                        a deleted account (an unsubscribe must keep working)
 *                        without keeping anyone's email.
 *   email_log          — when each person last caused an email, for the
 *                        per-sender daily cap that protects the app's credits.
 */

import type { CollectionSchema } from 'deepspace/schema'

const SERVER_ONLY = { read: false, create: false, update: false, delete: false }

export const emailPrefsSchema: CollectionSchema = {
  name: 'email_prefs',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    /** 128-bit random, base64url: the `t` in /unsubscribe?t=… links. */
    { name: 'token', storage: 'text', interpretation: 'plain', required: true },
  ],
  uniqueOn: ['userId'],
  permissions: { viewer: SERVER_ONLY, member: SERVER_ONLY, admin: SERVER_ONLY },
}

export const emailSuppressionsSchema: CollectionSchema = {
  name: 'email_suppressions',
  columns: [
    /** Hex SHA-256 of the trimmed, lower-cased address. */
    { name: 'emailHash', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    /** Epoch milliseconds. */
    { name: 'at', storage: 'number', interpretation: 'plain', required: true },
  ],
  uniqueOn: ['emailHash'],
  permissions: { viewer: SERVER_ONLY, member: SERVER_ONLY, admin: SERVER_ONLY },
}

export const emailLogSchema: CollectionSchema = {
  name: 'email_log',
  columns: [
    /** Whose action caused the email (not the recipient). */
    { name: 'senderId', storage: 'text', interpretation: 'plain', required: true },
    /** Epoch milliseconds. */
    { name: 'at', storage: 'number', interpretation: 'plain', required: true },
  ],
  permissions: { viewer: SERVER_ONLY, member: SERVER_ONLY, admin: SERVER_ONLY },
}
