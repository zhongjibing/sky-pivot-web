import { get, post, put, del } from './index'

export interface PasswordListParams {
  search?: string
  sortBy?: string
  order?: string
  page?: number
  size?: number
}

export function getPasswordList(params: PasswordListParams) {
  return get<Page<PasswordItem>>('/api/passwords', params)
}

export function getPasswordDetail(id: string, masterPassword: string) {
  return get<PasswordDetail>(`/api/passwords/${id}`, { masterPassword })
}

export function createPassword(data: { title: string; url?: string; account: string; password: string; notes?: string }) {
  return post<{ id: string; healthScore: number; healthLevel: string }>('/api/passwords', data)
}

export function updatePassword(id: string, data: { url?: string; account: string; password: string; notes?: string }, masterPassword: string) {
  return put(`/api/passwords/${id}`, data, { masterPassword })
}

export function deletePassword(id: string) {
  return del(`/api/passwords/${id}`)
}
