/**
 * View-only share links — `/join/<token>` lets a signed-in person who is not
 * in the owner's party open a board read-only.
 *
 * Written only by the actions in src/actions/links.ts (clients get no
 * create/update/delete), so a link can't be forged or un-revoked.
 *
 *   board_links          — one row per link. Only a SHA-256 hash of the
 *                          token is stored; the token itself is shown once.
 *                          Readable only by the board owner who made it.
 *   board_link_attempts  — failed redeems, for throttling guesses.
 *
 * People who join through a link get a `team_members` row with role `viewer`
 * and `viaLink` = the link's recordId (see sharing-schema.ts).
 */

import type { CollectionSchema } from 'deepspace/schema'

const SERVER_ONLY = { read: false, create: false, update: false, delete: false }
const OWNER_READ = { read: 'own', create: false, update: false, delete: false } as const

export const boardLinksSchema: CollectionSchema = {
  name: 'board_links',
  columns: [
    { name: 'boardId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    /** The board owner who made the link (only they can read or revoke it). */
    { name: 'ownerId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    /** Hex SHA-256 of the token. The token itself is never stored. */
    { name: 'tokenHash', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    /** Always 'viewer'. */
    { name: 'role', storage: 'text', interpretation: 'plain', required: true },
    /** Epoch milliseconds; absent = never expires. */
    { name: 'expiresAt', storage: 'number', interpretation: 'plain' },
    /** Epoch milliseconds; set once when revoked. */
    { name: 'revokedAt', storage: 'number', interpretation: 'plain' },
  ],
  ownerField: 'ownerId',
  permissions: { viewer: OWNER_READ, member: OWNER_READ, admin: OWNER_READ },
}

export const boardLinkAttemptsSchema: CollectionSchema = {
  name: 'board_link_attempts',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    /** Epoch milliseconds. */
    { name: 'at', storage: 'number', interpretation: 'plain', required: true },
  ],
  permissions: { viewer: SERVER_ONLY, member: SERVER_ONLY, admin: SERVER_ONLY },
}
