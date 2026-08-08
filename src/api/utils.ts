import { post } from './index'

export function generatePassword(params: {
  length: number
  uppercase: boolean
  lowercase: boolean
  digits: boolean
  special: boolean
}) {
  return post<{ password: string }>('/api/utils/generate-password', params)
}

export function checkStrength(password: string) {
  return post<{ score: number; level: string }>('/api/utils/check-strength', { password })
}
