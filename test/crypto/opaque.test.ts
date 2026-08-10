import { describe, it, expect } from 'vitest'
import {
  opaqueRegisterStart,
  opaqueRegisterFinish,
  opaqueLoginStart,
  opaqueLoginFinish,
  credentialIdentifier,
} from '@/crypto/opaque'
import type { OpaqueLoginFinishInput } from '@/crypto/opaque'
import { p256_oprf, p256 } from '@noble/curves/nist.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { extract, expand } from '@noble/hashes/hkdf.js'

const OPRF = p256_oprf.oprf

// ---------------------------------------------------------------------------
// Helper: simulate server-side KE2 for roundtrip testing
// ---------------------------------------------------------------------------

const Nh = 32
const Npk = 33
const Nsk = 32
const Nn = 32
const CTX = new TextEncoder().encode('sky-pivot-v1')

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.byteLength, 0)
  const r = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { r.set(a, offset); offset += a.byteLength }
  return r
}

function i2osp(val: number, len: number): Uint8Array {
  const r = new Uint8Array(len)
  for (let i = len - 1; i >= 0; i--) {
    r[i] = val & 0xff
    val >>>= 8
  }
  return r
}

function deriveAkeKeyPair(seed: Uint8Array): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const prk = hmac(sha256, new Uint8Array(32), seed)
  const info = new TextEncoder().encode('OPAQUE-DeriveDiffieHellmanKeyPair')
  const rawScalar = expand(sha256, prk, info, Nsk)
  const publicKey = p256.getPublicKey(rawScalar, true)
  return { publicKey, privateKey: rawScalar }
}

function hkdfExpandLabel(secret: Uint8Array, label: string, context: Uint8Array, length: number): Uint8Array {
  const prefix = new TextEncoder().encode('OPAQUE-')
  const labelBytes = new TextEncoder().encode(label)
  const fullLabel = concat(prefix, labelBytes)
  const info = concat(
    i2osp(length, 2),
    i2osp(fullLabel.length, 1),
    fullLabel,
    i2osp(context.length, 1),
    context,
  )
  return expand(sha256, secret, info, length)
}

function ecdh(privateScalar: Uint8Array, publicKeyBytes: Uint8Array): Uint8Array {
  const shared = p256.getSharedSecret(privateScalar, publicKeyBytes) as Uint8Array
  return shared.slice(0, 32) as Uint8Array
}

function simulateServerKE2(
  serverPrivateKey: Uint8Array,
  serverPublicKey: Uint8Array,
  oprfSeed: Uint8Array,
  blindedElementBase64: string,
  clientNonceBase64: string,
  clientAkePublicKeyBase64: string,
  registrationRecord: {
    clientPublicKey: Uint8Array
    maskingKey: Uint8Array
    envelopeNonce: Uint8Array
    authTag: Uint8Array
  },
  credentialId: Uint8Array,
): OpaqueLoginFinishInput & { sessionToken: string } {
  const blindedElement = Uint8Array.from(atob(blindedElementBase64), c => c.charCodeAt(0))
  const clientNonce = Uint8Array.from(atob(clientNonceBase64), c => c.charCodeAt(0))
  const clientAkePk = Uint8Array.from(atob(clientAkePublicKeyBase64), c => c.charCodeAt(0))

  const oprfKey = oprfSeed
  const evaluatedElement = OPRF.blindEvaluate(oprfKey, blindedElement)

  const maskingNonce = crypto.getRandomValues(new Uint8Array(Nn))

  const padInfo = concat(maskingNonce, new TextEncoder().encode('CredentialResponsePad'))
  const pad = expand(sha256, registrationRecord.maskingKey, padInfo, Npk + Nn + Nh)
  const plaintext = concat(
    serverPublicKey,
    registrationRecord.envelopeNonce,
    registrationRecord.authTag,
  )
  const maskedResponse = new Uint8Array(plaintext.length)
  for (let i = 0; i < plaintext.length; i++) maskedResponse[i] = plaintext[i] ^ pad[i]

  const serverAkeKeySeed = crypto.getRandomValues(new Uint8Array(Nsk))
  const serverAkeKp = deriveAkeKeyPair(serverAkeKeySeed)
  const serverNonce = crypto.getRandomValues(new Uint8Array(Nn))

  const cId = registrationRecord.clientPublicKey
  const sId = serverPublicKey

  const ke1Bytes = concat(blindedElement, clientNonce, clientAkePk)
  const credRespBytes = concat(evaluatedElement, maskingNonce, maskedResponse)

  const preamble = concat(
    new TextEncoder().encode('OPAQUEv1-'),
    i2osp(CTX.length, 2), CTX,
    i2osp(cId.length, 2), cId,
    ke1Bytes,
    i2osp(sId.length, 2), sId,
    credRespBytes,
    serverNonce,
    serverAkeKp.publicKey,
  )
  const preambleHash = sha256(preamble)

  const dh1 = ecdh(serverAkeKp.privateKey, clientAkePk)
  const dh2 = ecdh(serverPrivateKey, clientAkePk)
  const dh3 = ecdh(serverAkeKp.privateKey, registrationRecord.clientPublicKey)
  const ikm = concat(dh1, dh2, dh3)

  const prk = hmac(sha256, new Uint8Array(32), ikm)
  const handshakeSecret = hkdfExpandLabel(prk, 'HandshakeSecret', preambleHash, Nh)
  const km2 = hkdfExpandLabel(handshakeSecret, 'ServerMAC', new Uint8Array(0), Nh)
  const serverMac = hmac(sha256, km2, preambleHash)

  return {
    sessionToken: 'test-session-token',
    evaluatedElementBase64: btoa(String.fromCharCode(...evaluatedElement)),
    maskingNonceBase64: btoa(String.fromCharCode(...maskingNonce)),
    maskedResponseBase64: btoa(String.fromCharCode(...maskedResponse)),
    serverNonceBase64: btoa(String.fromCharCode(...serverNonce)),
    serverAkePublicKeyBase64: btoa(String.fromCharCode(...serverAkeKp.publicKey)),
    serverMacBase64: btoa(String.fromCharCode(...serverMac)),
  }
}

// ---------------------------------------------------------------------------
// Tests: opaqueLoginStart
// ---------------------------------------------------------------------------

describe('opaqueLoginStart', () => {
  it('returns all KE1 fields in base64', () => {
    const result = opaqueLoginStart('testPassword123!')
    expect(result.blindedElementBase64).toBeTypeOf('string')
    expect(result.clientNonceBase64).toBeTypeOf('string')
    expect(result.clientAkePublicKeyBase64).toBeTypeOf('string')
  })

  it('blinded element is 33-byte compressed P-256 point', () => {
    const result = opaqueLoginStart('test')
    const decoded = Uint8Array.from(atob(result.blindedElementBase64), c => c.charCodeAt(0))
    expect(decoded.byteLength).toBe(33)
    expect([0x02, 0x03]).toContain(decoded[0])
  })

  it('client AKE public key is 33-byte compressed P-256 point', () => {
    const result = opaqueLoginStart('test')
    const decoded = Uint8Array.from(atob(result.clientAkePublicKeyBase64), c => c.charCodeAt(0))
    expect(decoded.byteLength).toBe(33)
    expect([0x02, 0x03]).toContain(decoded[0])
  })

  it('client nonce is 32 bytes', () => {
    const result = opaqueLoginStart('test')
    const decoded = Uint8Array.from(atob(result.clientNonceBase64), c => c.charCodeAt(0))
    expect(decoded.byteLength).toBe(32)
  })

  it('state contains all required fields', () => {
    const result = opaqueLoginStart('testPassword')
    expect(result.state.blind).toBeInstanceOf(Uint8Array)
    expect(result.state.blind.byteLength).toBe(32)
    expect(result.state.password).toBeTypeOf('object')
    expect(result.state.blindedElement).toBeInstanceOf(Uint8Array)
    expect(result.state.blindedElement.byteLength).toBe(33)
    expect(result.state.clientNonce).toBeInstanceOf(Uint8Array)
    expect(result.state.clientAkePublicKey).toBeInstanceOf(Uint8Array)
    expect(result.state.clientAkePrivateKey).toBeInstanceOf(Uint8Array)
  })

  it('produces different blinded elements for different passwords', () => {
    const r1 = opaqueLoginStart('password1')
    const r2 = opaqueLoginStart('password2')
    expect(r1.blindedElementBase64).not.toBe(r2.blindedElementBase64)
  })
})

// ---------------------------------------------------------------------------
// Tests: opaqueLoginFinish — full roundtrip
// ---------------------------------------------------------------------------

describe('opaqueLoginFinish', () => {
  function createServerKeys() {
    const sk = new Uint8Array(32)
    crypto.getRandomValues(sk)
    const pk = p256.getPublicKey(sk, true)
    const oprfSeed = new Uint8Array(32)
    crypto.getRandomValues(oprfSeed)
    return { serverPrivateKey: sk, serverPublicKey: pk, oprfSeed }
  }

  it('full register→login roundtrip succeeds', () => {
    const password = 'MySecurePassword123!'
    const userIdentity = 'user@example.com'
    const credIdBytes = sha256(new TextEncoder().encode(userIdentity))
    const credId = btoa(String.fromCharCode(...credIdBytes))

    // Step 1: Register
    const regStart = opaqueRegisterStart(password)
    const { serverPrivateKey, serverPublicKey, oprfSeed } = createServerKeys()

    const evaluatedElement = OPRF.blindEvaluate(
      oprfSeed,
      Uint8Array.from(atob(regStart.blindedElementBase64), c => c.charCodeAt(0)),
    )
    const evaluatedB64 = btoa(String.fromCharCode(...evaluatedElement))
    const serverPubB64 = btoa(String.fromCharCode(...serverPublicKey))

    const regResult = opaqueRegisterFinish(regStart.state, evaluatedB64, serverPubB64)

    // Step 2: Login KE1
    const loginStart = opaqueLoginStart(password)

    // Step 3: Server simulates KE2
    const registrationRecord = {
      clientPublicKey: Uint8Array.from(atob(regResult.clientPublicKeyBase64), c => c.charCodeAt(0)),
      maskingKey: Uint8Array.from(atob(regResult.maskingKeyBase64), c => c.charCodeAt(0)),
      envelopeNonce: Uint8Array.from(atob(regResult.envelopeNonceBase64), c => c.charCodeAt(0)),
      authTag: Uint8Array.from(atob(regResult.authTagBase64), c => c.charCodeAt(0)),
    }

    const ke2 = simulateServerKE2(
      serverPrivateKey,
      serverPublicKey,
      oprfSeed,
      loginStart.blindedElementBase64,
      loginStart.clientNonceBase64,
      loginStart.clientAkePublicKeyBase64,
      registrationRecord,
      credIdBytes,
    )

    // Step 4: Client KE3
    const finishResult = opaqueLoginFinish(loginStart.state, {
      evaluatedElementBase64: ke2.evaluatedElementBase64,
      maskingNonceBase64: ke2.maskingNonceBase64,
      maskedResponseBase64: ke2.maskedResponseBase64,
      serverNonceBase64: ke2.serverNonceBase64,
      serverAkePublicKeyBase64: ke2.serverAkePublicKeyBase64,
      serverMacBase64: ke2.serverMacBase64,
    })

    expect(finishResult.clientMacBase64).toBeTypeOf('string')
    expect(finishResult.clientMacBase64.length).toBeGreaterThan(0)
    expect(finishResult.sessionKey).toBeInstanceOf(Uint8Array)
    expect(finishResult.sessionKey.byteLength).toBe(32)
    expect(finishResult.exportKey).toBeInstanceOf(Uint8Array)
    expect(finishResult.exportKey.byteLength).toBe(32)
  })

  it('wrong password fails', () => {
    const password = 'CorrectPassword123!'
    const wrongPassword = 'WrongPassword456!'

    const regStart = opaqueRegisterStart(password)
    const { serverPrivateKey, serverPublicKey, oprfSeed } = createServerKeys()

    const evaluatedElement = OPRF.blindEvaluate(
      oprfSeed,
      Uint8Array.from(atob(regStart.blindedElementBase64), c => c.charCodeAt(0)),
    )
    const evaluatedB64 = btoa(String.fromCharCode(...evaluatedElement))
    const serverPubB64 = btoa(String.fromCharCode(...serverPublicKey))

    const regResult = opaqueRegisterFinish(regStart.state, evaluatedB64, serverPubB64)

    const loginStart = opaqueLoginStart(wrongPassword)

    const registrationRecord = {
      clientPublicKey: Uint8Array.from(atob(regResult.clientPublicKeyBase64), c => c.charCodeAt(0)),
      maskingKey: Uint8Array.from(atob(regResult.maskingKeyBase64), c => c.charCodeAt(0)),
      envelopeNonce: Uint8Array.from(atob(regResult.envelopeNonceBase64), c => c.charCodeAt(0)),
      authTag: Uint8Array.from(atob(regResult.authTagBase64), c => c.charCodeAt(0)),
    }

    const credIdBytes = sha256(new TextEncoder().encode('user@test.com'))

    const ke2 = simulateServerKE2(
      serverPrivateKey, serverPublicKey, oprfSeed,
      loginStart.blindedElementBase64,
      loginStart.clientNonceBase64,
      loginStart.clientAkePublicKeyBase64,
      registrationRecord,
      credIdBytes,
    )

    expect(() =>
      opaqueLoginFinish(loginStart.state, {
        evaluatedElementBase64: ke2.evaluatedElementBase64,
        maskingNonceBase64: ke2.maskingNonceBase64,
        maskedResponseBase64: ke2.maskedResponseBase64,
        serverNonceBase64: ke2.serverNonceBase64,
        serverAkePublicKeyBase64: ke2.serverAkePublicKeyBase64,
        serverMacBase64: ke2.serverMacBase64,
      }),
    ).toThrow()
  })

  it('tampered server MAC fails', () => {
    const password = 'TestPassword123!'
    const regStart = opaqueRegisterStart(password)
    const { serverPrivateKey, serverPublicKey, oprfSeed } = createServerKeys()

    const evaluatedElement = OPRF.blindEvaluate(
      oprfSeed,
      Uint8Array.from(atob(regStart.blindedElementBase64), c => c.charCodeAt(0)),
    )
    const evaluatedB64 = btoa(String.fromCharCode(...evaluatedElement))
    const serverPubB64 = btoa(String.fromCharCode(...serverPublicKey))
    const regResult = opaqueRegisterFinish(regStart.state, evaluatedB64, serverPubB64)

    const loginStart = opaqueLoginStart(password)
    const credIdBytes = sha256(new TextEncoder().encode('user@test.com'))
    const registrationRecord = {
      clientPublicKey: Uint8Array.from(atob(regResult.clientPublicKeyBase64), c => c.charCodeAt(0)),
      maskingKey: Uint8Array.from(atob(regResult.maskingKeyBase64), c => c.charCodeAt(0)),
      envelopeNonce: Uint8Array.from(atob(regResult.envelopeNonceBase64), c => c.charCodeAt(0)),
      authTag: Uint8Array.from(atob(regResult.authTagBase64), c => c.charCodeAt(0)),
    }

    const ke2 = simulateServerKE2(
      serverPrivateKey, serverPublicKey, oprfSeed,
      loginStart.blindedElementBase64,
      loginStart.clientNonceBase64,
      loginStart.clientAkePublicKeyBase64,
      registrationRecord,
      credIdBytes,
    )

    // Tamper with server MAC
    const tamperedMac = new Uint8Array(32)
    crypto.getRandomValues(tamperedMac)
    const tamperedKe2 = {
      ...ke2,
      serverMacBase64: btoa(String.fromCharCode(...tamperedMac)),
    }

    expect(() =>
      opaqueLoginFinish(loginStart.state, tamperedKe2),
    ).toThrow(/Authentication failed/)
  })

  it('tampered masked response fails', () => {
    const password = 'TamperTest123!'
    const regStart = opaqueRegisterStart(password)
    const { serverPrivateKey, serverPublicKey, oprfSeed } = createServerKeys()

    const evaluatedElement = OPRF.blindEvaluate(
      oprfSeed,
      Uint8Array.from(atob(regStart.blindedElementBase64), c => c.charCodeAt(0)),
    )
    const evaluatedB64 = btoa(String.fromCharCode(...evaluatedElement))
    const serverPubB64 = btoa(String.fromCharCode(...serverPublicKey))
    const regResult = opaqueRegisterFinish(regStart.state, evaluatedB64, serverPubB64)

    const loginStart = opaqueLoginStart(password)
    const credIdBytes = sha256(new TextEncoder().encode('user@tamper.com'))
    const registrationRecord = {
      clientPublicKey: Uint8Array.from(atob(regResult.clientPublicKeyBase64), c => c.charCodeAt(0)),
      maskingKey: Uint8Array.from(atob(regResult.maskingKeyBase64), c => c.charCodeAt(0)),
      envelopeNonce: Uint8Array.from(atob(regResult.envelopeNonceBase64), c => c.charCodeAt(0)),
      authTag: Uint8Array.from(atob(regResult.authTagBase64), c => c.charCodeAt(0)),
    }

    const ke2 = simulateServerKE2(
      serverPrivateKey, serverPublicKey, oprfSeed,
      loginStart.blindedElementBase64,
      loginStart.clientNonceBase64,
      loginStart.clientAkePublicKeyBase64,
      registrationRecord,
      credIdBytes,
    )

    // Tamper with masked response
    const maskedRespBytes = Uint8Array.from(atob(ke2.maskedResponseBase64), c => c.charCodeAt(0))
    maskedRespBytes[0] ^= 0xff
    const tamperedKe2 = {
      ...ke2,
      maskedResponseBase64: btoa(String.fromCharCode(...maskedRespBytes)),
    }

    expect(() =>
      opaqueLoginFinish(loginStart.state, tamperedKe2),
    ).toThrow()
  })
})
