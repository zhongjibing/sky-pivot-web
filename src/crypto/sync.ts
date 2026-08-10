/**
 * Sync-related cryptographic operations
 *
 * Lamport clock conflict resolution — field-level merging
 * using encrypted field comparison and timestamp arbitration.
 */

export interface SyncConflict {
  localVersion: number
  remoteVersion: number
  field: string
}

/**
 * Resolve field-level sync conflict using Lamport clock version.
 *
 * The higher sync_version wins (last-writer-wins per field).
 * If versions are equal, the local value is preserved.
 *
 * @param local     Locally stored encrypted field value
 * @param remote    Remotely received encrypted field value
 * @param conflict  Version info for the conflicting field
 * @returns The resolved encrypted field value
 */
export function resolveSyncConflict(
  local: Uint8Array,
  remote: Uint8Array,
  conflict: SyncConflict,
): Uint8Array {
  if (conflict.remoteVersion > conflict.localVersion) {
    return remote
  }
  return local
}
