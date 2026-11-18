/**
 * Versions — the board's Git-style history. Each record is a full snapshot
 * of the board's shapes (boards are small) plus a summary of what changed.
 * Versions are append-only: members can read and add, nobody edits them.
 */

import type { CollectionSchema } from 'deepspace/schema'

export const versionsSchema: CollectionSchema = {
  name: 'versions',
  columns: [
    { name: 'boardId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'message', storage: 'text', interpretation: 'plain', required: true, maxLength: 500 },
    { name: 'authorName', storage: 'text', interpretation: 'plain' },
    { name: 'auto', storage: 'number', interpretation: { kind: 'boolean' } },
    { name: 'shapeCount', storage: 'number', interpretation: 'plain' },
    { name: 'snapshot', storage: 'text', interpretation: { kind: 'json' }, required: true },
  ],
  // Visible only to people on the board (see team_members in sharing-schema.ts).
  teamField: 'boardId',
  permissions: {
    viewer: { read: 'team', create: false, update: false, delete: false },
    member: { read: 'team', create: true, update: false, delete: false },
    admin: { read: 'team', create: true, update: false, delete: true },
  },
}
