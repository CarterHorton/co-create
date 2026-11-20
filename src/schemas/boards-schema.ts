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
 *
 * Deleting goes through the `boardDelete` action (src/actions/boards.ts) so the
 * board's versions, specs, access rows and canvas go with it; nobody may
 * delete the row directly.
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
    /** Owner's project (src/schemas/projects-schema.ts); '' or missing = none. Set via actions. */
    { name: 'projectId', storage: 'text', interpretation: 'plain' },
    /** Archived boards only show in the Archived view. Set via the boardArchive action. */
    { name: 'archived', storage: 'number', interpretation: { kind: 'boolean' } },
    /** Connected GitHub repo as JSON (src/github/repo.ts); '' or missing = none. Set via the repo actions. */
    { name: 'repo', storage: 'text', interpretation: 'plain' },
    /** Copy of the board's project's repo, kept in step by the actions; used when `repo` is empty. */
    { name: 'projectRepo', storage: 'text', interpretation: 'plain' },
  ],
  ownerField: 'ownerId',
  teamField: 'teamId',
  permissions: {
    viewer: { read: 'team', create: false, update: false, delete: false },
    member: { read: 'team', create: true, update: 'own', delete: false, writableFields: WRITABLE },
    admin: { read: 'team', create: true, update: 'own', delete: false, writableFields: WRITABLE },
  },
}
