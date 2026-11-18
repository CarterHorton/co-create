/**
 * Projects — folders for boards on /home — and per-user board pins.
 *
 *   projects        — owned by one user. Written only by the actions in
 *                     src/actions/projects.ts (they cap the name and cascade
 *                     a delete), so clients only read their own.
 *   project_members — friends a project is shared with. One row per
 *                     (project, friend); ownerId is the project's owner, who
 *                     is the only one who reads them. Server-written.
 *   project_grants  — which board access rows (`team_members`) a project
 *                     share created, so unsharing the project (or moving a
 *                     board out of it) revokes exactly those and leaves
 *                     boards sent directly alone. Never readable by clients.
 *   board_pins      — "favourite" boards, per user. A pin only changes the
 *                     pinner's own list, so the client writes its own rows.
 *
 * A board's `projectId` and `archived` columns live on `boards`
 * (boards-schema.ts) and are set only through the actions.
 */

import type { CollectionSchema } from 'deepspace/schema'

/** Longest project name, in characters. Also enforced by the actions. */
export const MAX_PROJECT_NAME_LENGTH = 80

const SERVER_ONLY = { read: false, create: false, update: false, delete: false }
const READ_OWN = { read: 'own' as const, create: false, update: false, delete: false }

export const projectsSchema: CollectionSchema = {
  name: 'projects',
  columns: [
    { name: 'name', storage: 'text', interpretation: 'plain', required: true, maxLength: MAX_PROJECT_NAME_LENGTH },
    { name: 'ownerId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
  ],
  ownerField: 'ownerId',
  permissions: { viewer: READ_OWN, member: READ_OWN, admin: READ_OWN },
}

export const projectMembersSchema: CollectionSchema = {
  name: 'project_members',
  columns: [
    { name: 'projectId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    /** The project's owner (who shared it). */
    { name: 'ownerId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    /** The friend it was shared with. */
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'name', storage: 'text', interpretation: 'plain' },
  ],
  uniqueOn: ['projectId', 'userId'],
  ownerField: 'ownerId',
  permissions: { viewer: READ_OWN, member: READ_OWN, admin: READ_OWN },
}

export const projectGrantsSchema: CollectionSchema = {
  name: 'project_grants',
  columns: [
    { name: 'projectId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'boardId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
  ],
  uniqueOn: ['projectId', 'boardId', 'userId'],
  permissions: { viewer: SERVER_ONLY, member: SERVER_ONLY, admin: SERVER_ONLY },
}

const PIN_RULES = { read: 'own' as const, create: true, update: false, delete: 'own' as const, writableFields: ['ownerId', 'boardId'] }

export const boardPinsSchema: CollectionSchema = {
  name: 'board_pins',
  columns: [
    { name: 'ownerId', storage: 'text', interpretation: 'plain', required: true, userBound: true, immutable: true },
    { name: 'boardId', storage: 'text', interpretation: 'plain', required: true, immutable: true, maxLength: 200 },
  ],
  uniqueOn: ['ownerId', 'boardId'],
  ownerField: 'ownerId',
  // Pins only change the pinner's own list, so every role may keep them.
  permissions: { viewer: PIN_RULES, member: PIN_RULES, admin: PIN_RULES },
}
