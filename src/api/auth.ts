/**
 * OPAQUE and authentication API endpoints
 */

import { get, post, put } from './index'

// ---------------------------------------------------------------------------
// Legacy API (pre-OPAQUE QR login — will be removed in Phase 2.2.2)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// OPAQUE endpoints (Phase 2.2.1+)
// ---------------------------------------------------------------------------

export interface OpaqueRegisterStartRequest {
  credentialIdentifierBase64: string
  blindedElementBase64: string
}

export interface OpaqueRegisterStartResponse {
  evaluatedElementBase64: string
  serverPublicKeyBase64: string
}

export interface OpaqueRegisterFinishRequest {
  credentialIdentifierBase64: string
  clientPublicKeyBase64: string
  maskingKeyBase64: string
  envelopeNonceBase64: string
  authTagBase64: string
}

export interface OpaqueLoginStartRequest {
  credentialIdentifierBase64: string
  blindedElementBase64: string
  clientNonceBase64: string
  clientAkePublicKeyBase64: string
}

export interface OpaqueLoginStartResponse {
  sessionToken: string
  evaluatedElementBase64: string
  maskingNonceBase64: string
  maskedResponseBase64: string
  serverNonceBase64: string
  serverAkePublicKeyBase64: string
  serverMacBase64: string
}

export interface OpaqueLoginFinishRequest {
  sessionToken: string
  credentialIdentifierBase64: string
  clientMacBase64: string
}

export interface OpaqueLoginFinishResponse {
  sessionToken: string
  userId: string
}

export interface TokenExchangeRequest {
  accessToken: string
}

export interface TokenExchangeResponse {
  userId: string
  deviceId: string
  atJti: string
  atExpiresAt: string
}

export async function opaqueRegisterStart(req: OpaqueRegisterStartRequest): Promise<OpaqueRegisterStartResponse> {
  return post('/api/auth/opaque/register-start', req)
}

export async function opaqueRegisterFinish(req: OpaqueRegisterFinishRequest): Promise<void> {
  return post('/api/auth/opaque/register-finish', req)
}

export async function opaqueLoginStart(req: OpaqueLoginStartRequest): Promise<OpaqueLoginStartResponse> {
  return post('/api/auth/opaque/login-start', req)
}

export async function opaqueLoginFinish(req: OpaqueLoginFinishRequest): Promise<OpaqueLoginFinishResponse> {
  return post('/api/auth/opaque/login-finish', req)
}

export async function tokenExchange(req: TokenExchangeRequest): Promise<TokenExchangeResponse> {
  return post('/api/auth/opaque/token-exchange', req)
}
