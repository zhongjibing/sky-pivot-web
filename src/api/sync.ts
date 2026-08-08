import { get } from './index'

export function checkSyncVersion() {
  return get<{ version: number }>('/api/sync/check')
}

export function pullSync(sinceVersion: number) {
  return get<{ changes: any[] }>('/api/sync/pull', { sinceVersion })
}
