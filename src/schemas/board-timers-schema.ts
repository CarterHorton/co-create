/**
 * Board timers — one shared countdown per board (src/timer). Everyone on the
 * board reads it live; only the `timerControl` action writes it
 * (src/actions/timer.ts), which checks the caller may edit the board and
 * stamps times with the server's clock. Times are server epoch milliseconds.
 */

import type { CollectionSchema } from 'deepspace/schema'

export const boardTimersSchema: CollectionSchema = {
  name: 'board_timers',
  columns: [
    { name: 'boardId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    /** 'idle' | 'running' | 'paused' */
    { name: 'status', storage: 'text', interpretation: 'plain', required: true },
    { name: 'durationMs', storage: 'number', interpretation: 'plain', required: true },
    { name: 'endsAt', storage: 'number', interpretation: 'plain' },
    { name: 'pausedRemainingMs', storage: 'number', interpretation: 'plain' },
    /** userId of whoever last started it. */
    { name: 'startedBy', storage: 'text', interpretation: 'plain' },
    { name: 'actorName', storage: 'text', interpretation: 'plain' },
    { name: 'lastOp', storage: 'text', interpretation: 'plain' },
    { name: 'rev', storage: 'number', interpretation: 'plain' },
  ],
  // One row per board, recordId = timerRecordId(boardId) (src/actions/timer.ts).
  // Visible only to people on the board (see team_members in sharing-schema.ts).
  teamField: 'boardId',
  permissions: {
    viewer: { read: 'team', create: false, update: false, delete: false },
    member: { read: 'team', create: false, update: false, delete: false },
    admin: { read: 'team', create: false, update: false, delete: false },
  },
}
