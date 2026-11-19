/**
 * Voting on sticky notes, in vote panels.
 *
 *   vote_panels — one per vote: opened on two or more selected sticky notes
 *                 by one person, who closes it to finalize the results (or it
 *                 closes when they leave; see src/votes/logic.ts). Closed
 *                 panels keep their results.
 *   votes       — one row per person per note per panel (unique on all four),
 *                 so two people voting at once each add their own row.
 *
 * Both are written only by the actions in src/actions/votes.ts, which check
 * board access, that the panel is open, that the note is in it, and the
 * per-person limit; clients can only read them. Everyone on the board can
 * read every vote: counts are public on the board.
 */

import type { CollectionSchema } from 'deepspace/schema'

const READ_ONLY = { read: 'team', create: false, update: false, delete: false } as const

export const votePanelsSchema: CollectionSchema = {
  name: 'vote_panels',
  columns: [
    { name: 'boardId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'openedBy', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'openedByName', storage: 'text', interpretation: 'plain', maxLength: 200 },
    { name: 'shapeIds', storage: 'text', interpretation: { kind: 'json' }, required: true },
    { name: 'perPerson', storage: 'number', interpretation: 'plain', required: true },
    { name: 'status', storage: 'text', interpretation: 'plain', required: true },
    { name: 'openedAt', storage: 'number', interpretation: 'plain', required: true },
    { name: 'heartbeatAt', storage: 'number', interpretation: 'plain', required: true },
    { name: 'closedAt', storage: 'number', interpretation: 'plain' },
    { name: 'closeReason', storage: 'text', interpretation: 'plain' },
    { name: 'results', storage: 'text', interpretation: { kind: 'json' } },
  ],
  // Visible only to people on the board (see team_members in sharing-schema.ts).
  teamField: 'boardId',
  permissions: { viewer: READ_ONLY, member: READ_ONLY, admin: READ_ONLY },
}

export const votesSchema: CollectionSchema = {
  name: 'votes',
  columns: [
    { name: 'boardId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'panelId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'shapeId', storage: 'text', interpretation: 'plain', required: true, immutable: true, maxLength: 200 },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
  ],
  uniqueOn: ['boardId', 'panelId', 'shapeId', 'userId'],
  teamField: 'boardId',
  permissions: { viewer: READ_ONLY, member: READ_ONLY, admin: READ_ONLY },
}
