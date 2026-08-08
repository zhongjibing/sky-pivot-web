import { get, post } from './index'

export function deleteAccount() {
  return post('/api/account/delete')
}

export function getDeletePreview() {
  return get<DeletePreview>('/api/account/delete/preview')
}
