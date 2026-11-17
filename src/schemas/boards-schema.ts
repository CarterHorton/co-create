/**
 * Boards — one record per whiteboard.
 *
 * Only metadata lives here. The shapes themselves live in the CanvasRoom
 * Durable Object keyed by the board's recordId (see useCanvas in
 * src/components/board/useBoard.ts).
 */

import type { CollectionSchema } from 'deepspace/schema'

export const boardsSchema: CollectionSchema = {
  name: 'boards',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain', required: true },
    { name: 'ownerId', storage: 'text', interpretation: 'plain', required: true, userBound: true, immutable: true },
  ],
  ownerField: 'ownerId',
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: true, update: 'own', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
