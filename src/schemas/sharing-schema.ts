/**
 * Sharing — friends ("party") and per-board access.
 *
 * Everything here is written only by the server actions in
 * src/actions/sharing.ts (clients get no create/update/delete), so a friend
 * code can't be forged and a board can only be sent to an existing friend.
 *
 *   team_members     — who may open a board. teamId = the board's recordId.
 *                      The SDK's 'team' permission level reads this table, so
 *                      boards, versions and specs all follow it.
 *   friendships      — one row per direction (A→B and B→A), so each side
 *                      reads only its own rows with 'own'.
 *   friend_codes     — short-lived 16-bit codes. Never readable by clients.
 *   friend_code_attempts — failed redeems, for throttling guesses.
 */

import type { CollectionSchema } from 'deepspace/schema'

const SERVER_ONLY = { read: false, create: false, update: false, delete: false }

export const teamMembersSchema: CollectionSchema = {
  name: 'team_members',
  columns: [
    { name: 'teamId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'status', storage: 'text', interpretation: 'plain' },
    { name: 'name', storage: 'text', interpretation: 'plain' },
    { name: 'role', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['teamId', 'userId'],
  teamField: 'teamId',
  ownerField: 'userId',
  // Anyone on a board can see who else is on it (the share list).
  permissions: {
    viewer: { read: 'team', create: false, update: false, delete: false },
    member: { read: 'team', create: false, update: false, delete: false },
    admin: { read: 'team', create: false, update: false, delete: false },
  },
}

export const friendshipsSchema: CollectionSchema = {
  name: 'friendships',
  columns: [
    { name: 'ownerId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'friendId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'friendName', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['ownerId', 'friendId'],
  ownerField: 'ownerId',
  permissions: {
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: 'own', create: false, update: false, delete: false },
  },
}

export const friendCodesSchema: CollectionSchema = {
  name: 'friend_codes',
  columns: [
    { name: 'code', storage: 'text', interpretation: 'plain', required: true },
    { name: 'ownerId', storage: 'text', interpretation: 'plain', required: true },
    /** Epoch milliseconds. */
    { name: 'expiresAt', storage: 'number', interpretation: 'plain', required: true },
  ],
  permissions: { viewer: SERVER_ONLY, member: SERVER_ONLY, admin: SERVER_ONLY },
}

export const friendCodeAttemptsSchema: CollectionSchema = {
  name: 'friend_code_attempts',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    /** Epoch milliseconds. */
    { name: 'at', storage: 'number', interpretation: 'plain', required: true },
  ],
  permissions: { viewer: SERVER_ONLY, member: SERVER_ONLY, admin: SERVER_ONLY },
}
