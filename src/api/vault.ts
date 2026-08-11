import { get, post, put, del } from './index'

export interface VaultItemRaw {
  itemId: string
  encryptedBlob: string
  version: number
  createdAt: string
  updatedAt: string
}

export interface VaultItemCreateRequest {
  itemId: string
  encryptedBlob: string
}

export interface VaultItemUpdateRequest {
  encryptedBlob: string
  version: number
}

export interface VaultListResponse {
  items: VaultItemRaw[]
  syncVersion: number
}

export function listVaultItems(sinceVersion?: number): Promise<VaultListResponse> {
  const params: Record<string, number> = {}
  if (sinceVersion !== undefined && sinceVersion > 0) {
    params.sinceVersion = sinceVersion
  }
  return get('/api/vault', params)
}

export function getVaultItem(itemId: string): Promise<VaultItemRaw> {
  return get(`/api/vault/items/${itemId}`)
}

export function createVaultItem(data: VaultItemCreateRequest): Promise<VaultItemRaw> {
  return post('/api/vault/items', data)
}

export function updateVaultItem(itemId: string, data: VaultItemUpdateRequest): Promise<VaultItemRaw> {
  return put(`/api/vault/items/${itemId}`, data)
}

export function softDeleteVaultItem(itemId: string): Promise<void> {
  return del(`/api/vault/items/${itemId}`)
}

export function listTrashItems(): Promise<VaultItemRaw[]> {
  return get('/api/vault/trash')
}

export function restoreTrashItem(itemId: string): Promise<VaultItemRaw> {
  return post(`/api/vault/trash/${itemId}/restore`)
}

export function permanentDeleteTrashItem(itemId: string): Promise<void> {
  return del(`/api/vault/trash/${itemId}`)
}
