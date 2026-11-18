/**
 * Boards — one record per whiteboard.
 *
 * Only metadata lives here. The shapes themselves live in the CanvasRoom
 * Durable Object keyed by the board's recordId (see useCanvas in
 * src/components/board/useBoard.ts).
 *
 * Boards are private: only the owner and the people it was sent to (rows in
 * `team_members` with teamId = this board's `teamId`, which is its recordId)
 * can read it. Sharing and revoking go through src/actions/sharing.ts; the
 * client may only set `title` (and `ownerId`, which is stamped and immutable).
 */

import type { CollectionSchema } from 'deepspace/schema'

const WRITABLE = ['title', 'ownerId']

export const boardsSchema: CollectionSchema = {
  name: 'boards',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain', required: true },
    { name: 'ownerId', storage: 'text', interpretation: 'plain', required: true, userBound: true, immutable: true },
    /** Set to the board's own recordId the first time it is shared. */
    { name: 'teamId', storage: 'text', interpretation: 'plain' },
    /** Bumped on every share/revoke so live board lists re-check access. */
    { name: 'accessVersion', storage: 'number', interpretation: 'plain' },
  ],
  ownerField: 'ownerId',
  teamField: 'teamId',
  permissions: {
    viewer: { read: 'team', create: false, update: false, delete: false },
    member: { read: 'team', create: true, update: 'own', delete: 'own', writableFields: WRITABLE },
    admin: { read: 'team', create: true, update: 'own', delete: 'own', writableFields: WRITABLE },
  },
}
