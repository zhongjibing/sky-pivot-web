/**
 * Access Token (AT) device private key signing
 *
 * The AT is a short-lived (2h) JWT signed by the device Ed25519 private key.
 * Server stores only the public key for verification — cannot forge ATs.
 *
 * AT format (JWT with EdDSA):
 *   Header:  { alg: "EdDSA", typ: "JWT" }
 *   Payload: { sub, did, type: "AT", iat, exp, jti }
 *   Signature: Ed25519(base64Url(header).base64Url(payload))
 *
 * DeviceSig format:
 *   Content:   HTTP_METHOD + REQUEST_PATH (e.g., "POST/api/vault/items")
 *   Signature: base64Url(Ed25519(content))
 */

export interface AccessTokenPayload {
  sub: string
  did: string
  type: string
  iat: number
  exp: number
  jti: string
}

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Create AT payload with standard claims.
 */
export function createAccessTokenPayload(userId: string, deviceId: string): AccessTokenPayload {
  const now = Math.floor(Date.now() / 1000)
  return {
    sub: userId,
    did: deviceId,
    type: 'AT',
    iat: now,
    exp: now + 2 * 60 * 60,
    jti: crypto.randomUUID(),
  }
}

/**
 * Sign access token with device Ed25519 private key.
 * Returns the full JWT string: header.payload.signature
 */
export async function signAccessToken(
  payload: AccessTokenPayload,
  privateKey: CryptoKey,
): Promise<string> {
  const header = { alg: 'EdDSA', typ: 'JWT' }
  const signingInput = base64UrlEncode(JSON.stringify(header)) + '.' + base64UrlEncode(JSON.stringify(payload))

  const signature = await crypto.subtle.sign(
    'Ed25519',
    privateKey,
    new TextEncoder().encode(signingInput),
  )

  return signingInput + '.' + base64UrlEncode(new Uint8Array(signature))
}

/**
 * Verify an AT JWT and return its payload.
 * Throws on invalid signature, malformed token, or expiration.
 */
export async function verifyAccessToken(token: string, publicKey: CryptoKey): Promise<AccessTokenPayload> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid token format')

  const [headerB64, payloadB64, signatureB64] = parts
  const signingInput = headerB64 + '.' + payloadB64
  const signature = base64UrlDecode(signatureB64)

  const valid = await crypto.subtle.verify(
    'Ed25519',
    publicKey,
    signature,
    new TextEncoder().encode(signingInput),
  )

  if (!valid) throw new Error('Invalid AT signature')

  const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64))
  const payload: AccessTokenPayload = JSON.parse(payloadJson)

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('AT expired')
  }

  return payload
}

/**
 * Sign a device signature for sensitive API operations.
 * Content: HTTP_METHOD + REQUEST_PATH (e.g., "POST/api/vault/items")
 * Returns base64url-encoded Ed25519 signature for the X-Device-Signature header.
 */
export async function signDeviceSignature(
  method: string,
  path: string,
  privateKey: CryptoKey,
): Promise<string> {
  const content = method.toUpperCase() + path
  const signature = await crypto.subtle.sign(
    'Ed25519',
    privateKey,
    new TextEncoder().encode(content),
  )
  return base64UrlEncode(new Uint8Array(signature))
}

/**
 * Verify a device signature.
 */
export async function verifyDeviceSignature(
  method: string,
  path: string,
  signatureB64: string,
  publicKey: CryptoKey,
): Promise<boolean> {
  const content = method.toUpperCase() + path
  const signature = base64UrlDecode(signatureB64)
  return crypto.subtle.verify(
    'Ed25519',
    publicKey,
    signature,
    new TextEncoder().encode(content),
  )
}
