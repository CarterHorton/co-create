/**
 * Voting on sticky notes.
 *
 *   votes       — one row per person per note (unique on boardId + shapeId +
 *                 userId), so two people voting at once each add their own
 *                 row and never overwrite each other's.
 *   vote_rounds — at most one per board: an optional dot-voting round with a
 *                 per-person vote limit, started and ended by the board owner.
 *
 * Both are written only by the actions in src/actions/votes.ts, which check
 * board access (and the round limit); clients can only read them. Everyone on
 * the board can read every vote: counts are public on the board.
 */

import type { CollectionSchema } from 'deepspace/schema'

const READ_ONLY = { read: 'team', create: false, update: false, delete: false } as const

export const votesSchema: CollectionSchema = {
  name: 'votes',
  columns: [
    { name: 'boardId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'shapeId', storage: 'text', interpretation: 'plain', required: true, immutable: true, maxLength: 200 },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
  ],
  uniqueOn: ['boardId', 'shapeId', 'userId'],
  // Visible only to people on the board (see team_members in sharing-schema.ts).
  teamField: 'boardId',
  permissions: { viewer: READ_ONLY, member: READ_ONLY, admin: READ_ONLY },
}

export const voteRoundsSchema: CollectionSchema = {
  name: 'vote_rounds',
  columns: [
    { name: 'boardId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    /** Votes per person while active. */
    { name: 'perPerson', storage: 'number', interpretation: 'plain', required: true },
    { name: 'active', storage: 'number', interpretation: { kind: 'boolean' } },
  ],
  uniqueOn: ['boardId'],
  teamField: 'boardId',
  permissions: { viewer: READ_ONLY, member: READ_ONLY, admin: READ_ONLY },
}
