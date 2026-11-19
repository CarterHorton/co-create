/**
 * Comments and @mentions on boards (signed-in boards only).
 *
 *   comments — one row per comment. A thread is a root comment (no parentId)
 *              plus its replies (parentId = the root's recordId). shapeId is
 *              the canvas shape it's pinned to, or empty for a board-level
 *              comment; if the shape is later deleted the thread stays, shown
 *              as "on a deleted shape". `resolved` lives on the root.
 *   mentions — one row per person @mentioned in a comment: their unread
 *              notification. `userId` is the person notified.
 *
 * Every write goes through src/actions/comments.ts (clients get no create /
 * update / delete), which checks board access: anyone who can open the board
 * (owner or an active team_members row, viewers included) may comment and
 * reply; authors edit and delete their own; the board owner may delete any
 * comment; the owner and the thread's author may resolve / reopen it.
 * `boardDelete` (src/actions/boards.ts) drains both collections.
 */

import type { CollectionSchema } from 'deepspace/schema'

const SERVER_WRITES = { create: false, update: false, delete: false } as const

export const commentsSchema: CollectionSchema = {
  name: 'comments',
  columns: [
    { name: 'boardId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'shapeId', storage: 'text', interpretation: 'plain', maxLength: 200 },
    /** What the shape was called when the thread started ("Sticky note: Buy milk"). */
    { name: 'shapeLabel', storage: 'text', interpretation: 'plain', maxLength: 200 },
    { name: 'parentId', storage: 'text', interpretation: 'plain', maxLength: 200 },
    { name: 'authorId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'authorName', storage: 'text', interpretation: 'plain' },
    { name: 'body', storage: 'text', interpretation: 'plain', required: true, maxLength: 4000 },
    /** userIds @mentioned in the body. */
    { name: 'mentions', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'resolved', storage: 'number', interpretation: { kind: 'boolean' } },
    /** ISO time of the last edit, empty if never edited. */
    { name: 'editedAt', storage: 'text', interpretation: 'plain' },
  ],
  // Visible only to people on the board (see team_members in sharing-schema.ts).
  teamField: 'boardId',
  permissions: {
    viewer: { read: 'team', ...SERVER_WRITES },
    member: { read: 'team', ...SERVER_WRITES },
    admin: { read: 'team', ...SERVER_WRITES },
  },
}

export const mentionsSchema: CollectionSchema = {
  name: 'mentions',
  columns: [
    /** The person mentioned (the notification's reader). */
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'boardId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'boardTitle', storage: 'text', interpretation: 'plain' },
    { name: 'commentId', storage: 'text', interpretation: 'plain', required: true },
    /** The thread's root comment (= commentId for a new thread). */
    { name: 'threadId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'actorName', storage: 'text', interpretation: 'plain' },
    { name: 'excerpt', storage: 'text', interpretation: 'plain', maxLength: 200 },
    { name: 'read', storage: 'number', interpretation: { kind: 'boolean' } },
  ],
  ownerField: 'userId',
  permissions: {
    viewer: { read: 'own', ...SERVER_WRITES },
    member: { read: 'own', ...SERVER_WRITES },
    admin: { read: 'own', ...SERVER_WRITES },
  },
}
