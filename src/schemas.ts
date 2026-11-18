/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { boardsSchema } from './schemas/boards-schema'
import { versionsSchema } from './schemas/versions-schema'
import { specsSchema } from './schemas/specs-schema'
import {
  friendCodeAttemptsSchema,
  friendCodesSchema,
  friendshipsSchema,
  teamMembersSchema,
} from './schemas/sharing-schema'
import { commentsSchema, mentionsSchema } from './schemas/comments-schema'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  boardsSchema,
  versionsSchema,
  specsSchema,
  teamMembersSchema,
  friendshipsSchema,
  friendCodesSchema,
  friendCodeAttemptsSchema,
  commentsSchema,
  mentionsSchema,
]
