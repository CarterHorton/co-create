import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { boardActions } from './boards'
import { sharingActions } from './sharing'
import { historyActions } from './history'
import { linkActions } from './links'

export const actions: Record<string, ActionHandler<Env>> = {
  ...boardActions,
  ...sharingActions,
  ...historyActions,
  ...linkActions,
}
