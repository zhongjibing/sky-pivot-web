/**
 * Searchable encryption via IndexedDB token index
 *
 * Title tokens are stored as plaintext (user-entered, non-sensitive)
 * Note tokens are encrypted with a search key derived from URK
 */

export async function indexVaultItem(
  _itemId: string,
  _title: string,
  _notes: string,
  _urk: CryptoKey,
): Promise<void> {
  throw new Error('Not implemented — Phase 2.1.5')
}

export async function searchVaultItems(
  _query: string,
  _urk: CryptoKey,
): Promise<string[]> {
  throw new Error('Not implemented — Phase 2.1.5')
}

export async function removeSearchIndex(_itemId: string): Promise<void> {
  throw new Error('Not implemented — Phase 2.1.5')
}
