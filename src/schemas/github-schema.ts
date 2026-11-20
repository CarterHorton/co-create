/**
 * GitHub repo links — see src/github/repo.ts for where a connected repo is
 * stored (columns on `boards` and `projects`).
 *
 *   github_calls — one row per GitHub lookup a person triggered, for the
 *                  per-user rate limit in src/actions/github.ts (the app
 *                  owner pays for every lookup). Never readable by clients.
 */

import type { CollectionSchema } from 'deepspace/schema'

const SERVER_ONLY = { read: false, create: false, update: false, delete: false }

export const githubCallsSchema: CollectionSchema = {
  name: 'github_calls',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    /** Epoch milliseconds. */
    { name: 'at', storage: 'number', interpretation: 'plain', required: true },
  ],
  permissions: { viewer: SERVER_ONLY, member: SERVER_ONLY, admin: SERVER_ONLY },
}
