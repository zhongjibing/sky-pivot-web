/**
 * Access Token (AT) device private key signing
 *
 * The AT is a short-lived (2h) token signed by the device Ed25519 private key.
 * Server stores only the public key for verification — cannot forge ATs.
 *
 * AT payload:
 *  { sub: userId, deviceId, iat, exp, jti }
 *
 * Signature format: Ed25519(payload_json || '.' || expiration_timestamp_ms)
 */

export interface AccessTokenPayload {
  sub: string
  deviceId: string
  iat: number
  exp: number
  jti: string
}

export async function signAccessToken(
  _payload: AccessTokenPayload,
  _privateKey: CryptoKey,
): Promise<string> {
  throw new Error('Not implemented — Phase 2.1.6')
}

export function createAccessTokenPayload(userId: string, deviceId: string): AccessTokenPayload {
  const now = Math.floor(Date.now() / 1000)
  return {
    sub: userId,
    deviceId,
    iat: now,
    exp: now + 2 * 60 * 60,
    jti: crypto.randomUUID(),
  }
}
