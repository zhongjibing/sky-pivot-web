import { get, put, del } from './index'

export function getTrashList() {
  return get<TrashItem[]>('/api/passwords/trash')
}

export function getTrashDetail(id: string, masterPassword: string) {
  return get<PasswordDetail>(`/api/passwords/trash/${id}`, { masterPassword })
}

export function restoreTrash(id: string) {
  return put(`/api/passwords/trash/${id}/restore`)
}

export function permanentDeleteTrash(id: string) {
  return del(`/api/passwords/trash/${id}`)
}
