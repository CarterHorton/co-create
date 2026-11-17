/**
 * Specs — Markdown published from a board for coding agents to fetch
 * (agent tools `specs_list` / `spec_get` in src/ai/tools.ts). Append-only:
 * each publish is a new record; the newest per board is "the" spec.
 */

import type { CollectionSchema } from 'deepspace/schema'

export const specsSchema: CollectionSchema = {
  name: 'specs',
  columns: [
    { name: 'boardId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'title', storage: 'text', interpretation: 'plain', required: true, maxLength: 300 },
    { name: 'markdown', storage: 'text', interpretation: 'plain', required: true },
    { name: 'authorName', storage: 'text', interpretation: 'plain' },
  ],
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: true, update: false, delete: 'own' },
    admin: { read: true, create: true, update: false, delete: true },
  },
}
