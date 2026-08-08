/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface TrustedTypePolicyFactory {
  createPolicy(
    policyName: string,
    policyOptions: {
      createHTML?: (input: string) => string
      createScript?: (input: string) => string
      createScriptURL?: (input: string) => string
    },
  ): TrustedTypePolicy
}

interface TrustedTypePolicy {
  createHTML(input: string): TrustedHTML
  createScriptURL(input: string): TrustedScriptURL
}

interface Window {
  trustedTypes?: TrustedTypePolicyFactory
}

interface ApiResponse<T = any> {
  code: number
  message: string
  data: T
  timestamp: number
}

interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  size: number
  number: number
}

interface PasswordItem {
  id: string
  title: string
  url: string
  account: string
  healthLevel: string
  updatedAt: string
}

interface PasswordDetail {
  id: string
  title: string
  url: string
  account: string
  password: string
  notes: string
  healthScore: number
  healthLevel: string
}

interface TrashItem {
  id: string
  title: string
  account: string
  deletedAt: string
  daysRemaining: number
}

interface HealthSummary {
  weak: number
  fair: number
  strong: number
  veryStrong: number
}

interface QrCodeResponse {
  ticket: string
  qrCodeUrl: string
}

interface LoginStatusResponse {
  status: 'WAITING' | 'SCANNED' | 'CONFIRMED' | 'EXPIRED'
  token?: string
}

interface MasterPasswordStatus {
  masterPasswordSet: boolean
}

interface DeletePreview {
  totalPasswords: number
  trashedPasswords: number
  loginHistoryRecords: number
}
