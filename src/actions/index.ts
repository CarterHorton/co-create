import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { sharingActions } from './sharing'
import { historyActions } from './history'

export const actions: Record<string, ActionHandler<Env>> = {
  ...sharingActions,
  ...historyActions,
}
