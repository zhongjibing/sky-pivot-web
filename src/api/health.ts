import { get } from './index'

export function getHealthSummary() {
  return get<HealthSummary>('/api/passwords/health/summary')
}

export function getWeakPasswords() {
  return get<PasswordItem[]>('/api/passwords/health/weak')
}
