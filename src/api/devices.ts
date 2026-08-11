import { get, post, del } from './index'

export interface DeviceListItem {
  deviceId: string
  deviceName: string
  deviceType: string
  authorized: boolean
  revoked: boolean
  lastSeen: string | null
  createdAt: string | null
}

export interface DeviceActivateRequest {
  deviceId: string
  deviceName: string
  deviceType: string
  ed25519PublicKey: string
}

export interface DeviceActivateResponse {
  deviceId: string
  deviceName: string
  deviceType: string
  authorized: boolean
  isFirstDevice: boolean
  createdAt: string | null
}

export interface Level2AuthInitRequest {
  tempPublicKey: string
  fingerprint: string
}

export interface Level2AuthInitResponse {
  requestId: string
  fingerprint: string
  expiresAt: string
}

export interface Level2AuthCompleteRequest {
  requestId: string
  encryptedDek: string
  ed25519PublicKey: string
  deviceId: string
  deviceName: string
  deviceType: string
}

export interface EmergencyAuthChallengeRequest {
  credentialIdentifier: string
}

export interface EmergencyAuthChallengeResponse {
  requestId: string
  recoverySalt: string
  challenge: string
  expiresAt: string
}

export interface EmergencyAuthVerifyRequest {
  requestId: string
  recoveryKeyHash: string
  smsCode: string
  deviceId: string
  deviceName: string
  deviceType: string
  ed25519PublicKey: string
}

export interface EmergencyAuthResponse {
  deviceId: string
  authorized: boolean
  emergencyMode: boolean
  expiresAt: string
  requiresNewRecoveryCode: boolean
}

export function getDevices(): Promise<DeviceListItem[]> {
  return get('/api/devices')
}

export function revokeDevice(deviceId: string): Promise<void> {
  return del(`/api/devices/${deviceId}`)
}

export function activateDevice(data: DeviceActivateRequest): Promise<DeviceActivateResponse> {
  return post('/api/devices/activate', data)
}

export function initLevel2Auth(data: Level2AuthInitRequest): Promise<Level2AuthInitResponse> {
  return post('/api/devices/authorize/level2/init', data)
}

export function getLevel2AuthStatus(requestId: string): Promise<Level2AuthInitResponse> {
  return get(`/api/devices/authorize/level2/${requestId}`)
}

export function verifyLevel2Totp(requestId: string, totpCode: string): Promise<void> {
  return post('/api/devices/authorize/level2/totp', { requestId, totpCode })
}

export function uploadLevel2Dek(requestId: string, encryptedDek: string): Promise<void> {
  return post('/api/devices/authorize/level2/upload-dek', { requestId, encryptedDek })
}

export function completeLevel2Auth(data: Level2AuthCompleteRequest): Promise<DeviceActivateResponse> {
  return post('/api/devices/authorize/level2/complete', data)
}

export function downloadLevel2Dek(requestId: string): Promise<{ encryptedDek: string }> {
  return get(`/api/devices/authorize/level2/${requestId}/dek`)
}

export function emergencyAuthChallenge(data: EmergencyAuthChallengeRequest): Promise<EmergencyAuthChallengeResponse> {
  return post('/api/devices/emergency-auth/challenge', data)
}

export function emergencyAuthVerify(data: EmergencyAuthVerifyRequest): Promise<EmergencyAuthResponse> {
  return post('/api/devices/emergency-auth/verify', data)
}
