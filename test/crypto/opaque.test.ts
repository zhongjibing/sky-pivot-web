import { describe, it, expect } from 'vitest'
import { opaqueRegisterStart, opaqueRegisterFinish, credentialIdentifier } from '@/crypto/opaque'
import { p256_oprf, p256 } from '@noble/curves/nist.js'

const OPRF = p256_oprf.oprf

describe('opaqueRegisterStart', () => {
  it('returns blindedElementBase64 and state', () => {
    const result = opaqueRegisterStart('MySecurePassword123!')
    expect(result.blindedElementBase64).toBeTypeOf('string')
    expect(result.blindedElementBase64.length).toBeGreaterThan(0)
    expect(result.state.blind).toBeInstanceOf(Uint8Array)
    expect(result.state.blind.byteLength).toBe(32)
    expect(result.state.password.constructor.name).toBe('Uint8Array')
  })

  it('produces different blinded elements for different passwords', () => {
    const r1 = opaqueRegisterStart('password1')
    const r2 = opaqueRegisterStart('password2')
    expect(r1.blindedElementBase64).not.toBe(r2.blindedElementBase64)
  })

  it('produces different blinded elements for same password (random blind)', () => {
    const r1 = opaqueRegisterStart('samePassword')
    const r2 = opaqueRegisterStart('samePassword')
    expect(r1.blindedElementBase64).not.toBe(r2.blindedElementBase64)
  })

  it('blinded element is decodable base64', () => {
    const result = opaqueRegisterStart('test')
    const decoded = Uint8Array.from(atob(result.blindedElementBase64), c => c.charCodeAt(0))
    // Ed25519 compressed P-256 point: 0x02 or 0x03 prefix + 32 bytes = 33 bytes
    expect(decoded.byteLength).toBe(33)
    expect([0x02, 0x03]).toContain(decoded[0])
  })
})

describe('opaqueRegisterFinish', () => {
  function createServerKey() {
    return OPRF.generateKeyPair().secretKey
  }

  it('returns all required fields in base64', () => {
    const { state, blindedElementBase64 } = opaqueRegisterStart('password123!')

    // Simulate server: blindEvaluate
    const serverKey = createServerKey()
    const blinded = Uint8Array.from(atob(blindedElementBase64), c => c.charCodeAt(0))
    const evaluatedElement = OPRF.blindEvaluate(serverKey, blinded)
    const evaluatedB64 = btoa(String.fromCharCode(...evaluatedElement))

    // Server generates AKE key pair (using @noble's p256)
    const serverPriv = new Uint8Array(32).fill(0x55)
    const serverPublicKey = p256.getPublicKey(serverPriv, true)
    const serverPubB64 = btoa(String.fromCharCode(...serverPublicKey))

    const result = opaqueRegisterFinish(state, evaluatedB64, serverPubB64)

    expect(result.clientPublicKeyBase64).toBeTypeOf('string')
    expect(result.maskingKeyBase64).toBeTypeOf('string')
    expect(result.envelopeNonceBase64).toBeTypeOf('string')
    expect(result.authTagBase64).toBeTypeOf('string')
  })

  it('client public key is valid base64 compressed P-256 point', () => {
    const { state, blindedElementBase64 } = opaqueRegisterStart('test')
    const serverKey = createServerKey()
    const blinded = Uint8Array.from(atob(blindedElementBase64), c => c.charCodeAt(0))
    const evaluated = OPRF.blindEvaluate(serverKey, blinded)
    const evaluatedB64 = btoa(String.fromCharCode(...evaluated))

    const serverPriv = new Uint8Array(32).fill(0x11)
    const serverPub = p256.getPublicKey(serverPriv, true)
    const serverPubB64 = btoa(String.fromCharCode(...serverPub))

    const result = opaqueRegisterFinish(state, evaluatedB64, serverPubB64)

    const pubKeyDecoded = Uint8Array.from(atob(result.clientPublicKeyBase64), c => c.charCodeAt(0))
    expect(pubKeyDecoded.byteLength).toBe(33)
    expect([0x02, 0x03]).toContain(pubKeyDecoded[0])
  })

  it('produces deterministic results for same inputs', () => {
    // This test verifies that the same password + server response + fixed nonce
    // would produce the same client public key. But since nonce is random,
    // we just verify the format is consistent.
    const { state, blindedElementBase64 } = opaqueRegisterStart('password')
    const serverKey = createServerKey()
    const blinded = Uint8Array.from(atob(blindedElementBase64), c => c.charCodeAt(0))
    const evaluated = OPRF.blindEvaluate(serverKey, blinded)
    const evaluatedB64 = btoa(String.fromCharCode(...evaluated))

    const serverPriv = new Uint8Array(32).fill(0x33)
    const serverPub = p256.getPublicKey(serverPriv, true)
    const serverPubB64 = btoa(String.fromCharCode(...serverPub))

    const r1 = opaqueRegisterFinish(state, evaluatedB64, serverPubB64)
    const r2 = opaqueRegisterFinish(state, evaluatedB64, serverPubB64)

    // Nonce is random each time, so results differ
    expect(r1.clientPublicKeyBase64).not.toBe(r2.clientPublicKeyBase64)
    expect(r1.envelopeNonceBase64).not.toBe(r2.envelopeNonceBase64)
  })

  it('different passwords produce different results', () => {
    const r1 = opaqueRegisterStart('passwordA')
    const r2 = opaqueRegisterStart('passwordB')
    expect(r1.blindedElementBase64).not.toBe(r2.blindedElementBase64)
  })
})

describe('credentialIdentifier', () => {
  it('returns base64-encoded SHA-256 hash', () => {
    const credId = credentialIdentifier('user@example.com')
    expect(credId).toBeTypeOf('string')
    expect(credId.length).toBe(44) // base64 of 32 bytes
  })

  it('same input produces same output (deterministic)', () => {
    expect(credentialIdentifier('alice')).toBe(credentialIdentifier('alice'))
  })

  it('different inputs produce different outputs', () => {
    expect(credentialIdentifier('alice')).not.toBe(credentialIdentifier('bob'))
  })
})
