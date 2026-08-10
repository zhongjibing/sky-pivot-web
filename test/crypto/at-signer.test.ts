import { describe, it, expect, beforeEach } from 'vitest'
import {
  createAccessTokenPayload,
  signAccessToken,
  verifyAccessToken,
  signDeviceSignature,
  verifyDeviceSignature,
} from '@/crypto/at-signer'
import type { AccessTokenPayload } from '@/crypto/at-signer'
import { generateDeviceKeyPair, importPublicKey, importPrivateKey, generateStorableKeyPair } from '@/crypto/device'

describe('createAccessTokenPayload', () => {
  it('sets correct structure with all fields', () => {
    const payload = createAccessTokenPayload('user-123', 'device-abc')
    expect(payload.sub).toBe('user-123')
    expect(payload.did).toBe('device-abc')
    expect(payload.type).toBe('AT')
    expect(payload.iat).toBeGreaterThan(0)
    expect(payload.exp).toBeGreaterThan(payload.iat)
    expect(payload.jti).toBeTypeOf('string')
    expect(payload.jti.split('-').length).toBe(5)
  })

  it('expiration is 2 hours after issued at', () => {
    const payload = createAccessTokenPayload('user-1', 'dev-1')
    expect(payload.exp - payload.iat).toBe(7200)
  })

  it('produces unique JTIs per call', () => {
    const p1 = createAccessTokenPayload('user-1', 'dev-1')
    const p2 = createAccessTokenPayload('user-1', 'dev-1')
    expect(p1.jti).not.toBe(p2.jti)
  })
})

describe('signAccessToken', () => {
  it('creates a 3-part JWT string', async () => {
    const pair = await generateDeviceKeyPair()
    const payload = createAccessTokenPayload('user-1', 'dev-1')
    const token = await signAccessToken(payload, pair.privateKey)

    const parts = token.split('.')
    expect(parts.length).toBe(3)
    expect(parts[0]).toBeTruthy()
    expect(parts[1]).toBeTruthy()
    expect(parts[2]).toBeTruthy()
    // Header should decode to base64url of {"alg":"EdDSA","typ":"JWT"}
    expect(parts[0]).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('produces different signatures for different payloads', async () => {
    const pair = await generateDeviceKeyPair()
    const p1 = createAccessTokenPayload('user-1', 'dev-1')
    const p2 = createAccessTokenPayload('user-2', 'dev-1')

    const t1 = await signAccessToken(p1, pair.privateKey)
    const t2 = await signAccessToken(p2, pair.privateKey)

    const sig1 = t1.split('.')[2]
    const sig2 = t2.split('.')[2]
    expect(sig1).not.toBe(sig2)
  })

  it('different private keys produce different signatures for same payload', async () => {
    const pair1 = await generateDeviceKeyPair()
    const pair2 = await generateDeviceKeyPair()
    const payload = createAccessTokenPayload('user-1', 'dev-1')

    const sig1 = (await signAccessToken(payload, pair1.privateKey)).split('.')[2]
    const sig2 = (await signAccessToken(payload, pair2.privateKey)).split('.')[2]
    expect(sig1).not.toBe(sig2)
  })
})

describe('verifyAccessToken', () => {
  let pair: { publicKey: Uint8Array; privateKey: CryptoKey }
  let pubKey: CryptoKey

  beforeEach(async () => {
    pair = await generateDeviceKeyPair()
    pubKey = await importPublicKey(pair.publicKey)
  })

  it('roundtrip: sign then verify returns original payload', async () => {
    const payload = createAccessTokenPayload('user-42', 'dev-xyz')
    const token = await signAccessToken(payload, pair.privateKey)
    const verified = await verifyAccessToken(token, pubKey)

    expect(verified.sub).toBe('user-42')
    expect(verified.did).toBe('dev-xyz')
    expect(verified.type).toBe('AT')
    expect(verified.iat).toBe(payload.iat)
    expect(verified.exp).toBe(payload.exp)
    expect(verified.jti).toBe(payload.jti)
  })

  it('rejects token verified with wrong public key', async () => {
    const wrongPair = await generateDeviceKeyPair()
    const wrongPubKey = await importPublicKey(wrongPair.publicKey)

    const payload = createAccessTokenPayload('user-1', 'dev-1')
    const token = await signAccessToken(payload, pair.privateKey)

    await expect(verifyAccessToken(token, wrongPubKey)).rejects.toThrow('Invalid AT signature')
  })

  it('rejects tampered payload (altered user ID)', async () => {
    const payload = createAccessTokenPayload('user-1', 'dev-1')
    const token = await signAccessToken(payload, pair.privateKey)

    const parts = token.split('.')
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4) base64 += '='
    const binary = atob(base64)
    const payloadJson = JSON.parse(binary)
    payloadJson.sub = 'user-2'

    const tamperedPayloadB64 = btoa(JSON.stringify(payloadJson))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    const tampered = parts[0] + '.' + tamperedPayloadB64 + '.' + parts[2]

    await expect(verifyAccessToken(tampered, pubKey)).rejects.toThrow('Invalid AT signature')
  })

  it('rejects tampered signature', async () => {
    const payload = createAccessTokenPayload('user-1', 'dev-1')
    const token = await signAccessToken(payload, pair.privateKey)

    const parts = token.split('.')
    const tamperedSig = parts[2].slice(0, -2) + (parts[2].slice(-2) === 'ab' ? 'cd' : 'ab')
    const tampered = parts[0] + '.' + parts[1] + '.' + tamperedSig

    await expect(verifyAccessToken(tampered, pubKey)).rejects.toThrow()
  })

  it('rejects malformed token (only 2 parts)', async () => {
    await expect(verifyAccessToken('header.payload', pubKey)).rejects.toThrow('Invalid token format')
  })

  it('rejects empty token', async () => {
    await expect(verifyAccessToken('', pubKey)).rejects.toThrow()
  })
})

describe('AT expiration', () => {
  it('rejects expired token', async () => {
    const pair = await generateDeviceKeyPair()
    const pubKey = await importPublicKey(pair.publicKey)

    const now = Math.floor(Date.now() / 1000)
    const expiredPayload: AccessTokenPayload = {
      sub: 'user-1',
      did: 'dev-1',
      type: 'AT',
      iat: now - 7200,
      exp: now - 1, // expired 1 second ago
      jti: crypto.randomUUID(),
    }

    const token = await signAccessToken(expiredPayload, pair.privateKey)
    await expect(verifyAccessToken(token, pubKey)).rejects.toThrow('AT expired')
  })

  it('accepts token with future expiration', async () => {
    const pair = await generateDeviceKeyPair()
    const pubKey = await importPublicKey(pair.publicKey)

    const now = Math.floor(Date.now() / 1000)
    const futurePayload: AccessTokenPayload = {
      sub: 'user-1',
      did: 'dev-1',
      type: 'AT',
      iat: now,
      exp: now + 3600, // 1 hour from now
      jti: crypto.randomUUID(),
    }

    const token = await signAccessToken(futurePayload, pair.privateKey)
    const verified = await verifyAccessToken(token, pubKey)
    expect(verified.sub).toBe('user-1')
  })
})

describe('signDeviceSignature', () => {
  let pair: { publicKey: Uint8Array; privateKey: CryptoKey }

  beforeEach(async () => {
    pair = await generateDeviceKeyPair()
  })

  it('produces base64url-encoded string', async () => {
    const sig = await signDeviceSignature('POST', '/api/vault/items', pair.privateKey)
    expect(sig).toBeTypeOf('string')
    expect(sig).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('different methods produce different signatures', async () => {
    const sigPost = await signDeviceSignature('POST', '/api/vault/items', pair.privateKey)
    const sigGet = await signDeviceSignature('GET', '/api/vault/items', pair.privateKey)
    expect(sigPost).not.toBe(sigGet)
  })

  it('different paths produce different signatures', async () => {
    const sig1 = await signDeviceSignature('POST', '/api/vault/items', pair.privateKey)
    const sig2 = await signDeviceSignature('POST', '/api/vault/items/123', pair.privateKey)
    expect(sig1).not.toBe(sig2)
  })

  it('method is case-insensitive (POST = post)', async () => {
    const sigUpper = await signDeviceSignature('POST', '/api/vault', pair.privateKey)
    const sigLower = await signDeviceSignature('post', '/api/vault', pair.privateKey)
    expect(sigUpper).toBe(sigLower)
  })
})

describe('verifyDeviceSignature', () => {
  let pair: { publicKey: Uint8Array; privateKey: CryptoKey }
  let pubKey: CryptoKey

  beforeEach(async () => {
    pair = await generateDeviceKeyPair()
    pubKey = await importPublicKey(pair.publicKey)
  })

  it('roundtrip: sign then verify returns true', async () => {
    const sig = await signDeviceSignature('DELETE', '/api/devices/d-123', pair.privateKey)
    const valid = await verifyDeviceSignature('DELETE', '/api/devices/d-123', sig, pubKey)
    expect(valid).toBe(true)
  })

  it('returns false for wrong method', async () => {
    const sig = await signDeviceSignature('POST', '/api/vault/items', pair.privateKey)
    const valid = await verifyDeviceSignature('GET', '/api/vault/items', sig, pubKey)
    expect(valid).toBe(false)
  })

  it('returns false for wrong path', async () => {
    const sig = await signDeviceSignature('POST', '/api/vault/items', pair.privateKey)
    const valid = await verifyDeviceSignature('POST', '/api/vault/other', sig, pubKey)
    expect(valid).toBe(false)
  })

  it('returns false for tampered signature', async () => {
    const sig = await signDeviceSignature('POST', '/api/vault/items', pair.privateKey)
    const tamperedSig = sig.slice(0, -2) + (sig.slice(-2) === 'ab' ? 'cd' : 'ab')
    const valid = await verifyDeviceSignature('POST', '/api/vault/items', tamperedSig, pubKey)
    expect(valid).toBe(false)
  })

  it('returns false with wrong public key', async () => {
    const wrongPair = await generateDeviceKeyPair()
    const wrongPubKey = await importPublicKey(wrongPair.publicKey)

    const sig = await signDeviceSignature('POST', '/api/vault/items', pair.privateKey)
    const valid = await verifyDeviceSignature('POST', '/api/vault/items', sig, wrongPubKey)
    expect(valid).toBe(false)
  })

  it('verify is case-insensitive for method', async () => {
    const sig = await signDeviceSignature('POST', '/api/vault', pair.privateKey)
    const valid = await verifyDeviceSignature('post', '/api/vault', sig, pubKey)
    expect(valid).toBe(true)
  })
})
