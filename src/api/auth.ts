import { get, post, put } from './index'

export function getQrCode() {
  return post<QrCodeResponse>('/api/pc/login/qrcode')
}

export function getLoginStatus(ticket: string) {
  return get<LoginStatusResponse>(`/api/pc/login/status/${ticket}`)
}

export function getMasterPasswordStatus() {
  return get<MasterPasswordStatus>('/api/master-password/status')
}

export function setupMasterPassword(masterPassword: string) {
  return post<{ masterPassword: string }>('/api/master-password/setup', { masterPassword })
}

export function verifyMasterPassword(masterPassword: string) {
  return post<{ token: string }>('/api/master-password/verify', { masterPassword })
}

export function changeMasterPassword(currentMasterPassword: string, newMasterPassword: string) {
  return put('/api/master-password/change', { currentMasterPassword, newMasterPassword })
}
