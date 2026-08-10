/**
 * Hofmann OPAQUE client — RFC 9497 OPRF + RFC OPAQUE registration/login
 *
 * Protocol (Hofmann variant with HMAC-based envelope, no encryption):
 *
 * Registration:
 *   1) OPRF blind(password) → { blind, blindedElement }
 *   2) Server: blindEvaluate(key, blindedElement) → evaluatedElement
 *   3) OPRF finalize → oprfOutput
 *   4) HKDF-Extract(zero, oprfOutput || Argon2id(oprfOutput, ctx, 3, 65536, 1)) → randomizedPwd
 *   5) Derive keys from randomizedPwd + nonce → maskingKey, authKey, privateKeySeed
 *   6) deriveAkeKeyPair(privateKeySeed) → (skU, pkU)
 *   7) HMAC(authKey, nonce || serializedCleartextCreds) → authTag
 *   8) Return { clientPublicKey, maskingKey, envelope: { nonce, authTag } }
 *
 * Login (3-message AKE):
 *   1-4) Same OPRF process
 *   5) generateKE1: blind password + ephemeral key pair
 *   6) Server returns KE2: evaluatedElement, serverNonce, serverPublicKey, serverMac
 *   7) generateKE3: verify serverMac, compute clientMac
 */

import { p256_oprf, p256 } from '@noble/curves/nist.js'
import { argon2id } from '@noble/hashes/argon2.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { extract, expand } from '@noble/hashes/hkdf.js'

const OPRF = p256_oprf.oprf
const CTX = new TextEncoder().encode('sky-pivot-v1')
const Nh = 32

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.byteLength, 0)
  const r = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { r.set(a, offset); offset += a.byteLength }
  return r
}

function deriveRandomizedPwd(
  password: Uint8Array,
  blind: Uint8Array,
  evaluatedElement: Uint8Array,
): Uint8Array {
  const oprfOutput = OPRF.finalize(password, blind, evaluatedElement)
  const stretched = argon2id(oprfOutput, CTX, { t: 3, m: 65536, p: 1, dkLen: Nh })
  return extract(sha256, concat(oprfOutput, stretched), new Uint8Array(Nh))
}

function deriveKeys(randomizedPwd: Uint8Array, nonce: Uint8Array) {
  const maskingKey = expand(sha256, randomizedPwd, concat(nonce, new TextEncoder().encode('MaskingKey')), Nh)
  const authKey = expand(sha256, randomizedPwd, concat(nonce, new TextEncoder().encode('AuthKey')), Nh)
  const exportKey = expand(sha256, randomizedPwd, concat(nonce, new TextEncoder().encode('ExportKey')), Nh)
  const privateKeySeed = expand(sha256, randomizedPwd, concat(nonce, new TextEncoder().encode('PrivateKey')), Nh)
  return { maskingKey, authKey, exportKey, privateKeySeed }
}

function deriveAkeKeyPair(privateKeySeed: Uint8Array) {
  const publicKey = p256.getPublicKey(privateKeySeed, true)
  return { publicKey }
}

function serializeCleartextCreds(
  serverPublicKey: Uint8Array,
  serverIdentity: Uint8Array,
  clientIdentity: Uint8Array,
): Uint8Array {
  const serIdLen = new Uint8Array(2)
  new DataView(serIdLen.buffer).setUint16(0, serverIdentity.length, false)
  const cliIdLen = new Uint8Array(2)
  new DataView(cliIdLen.buffer).setUint16(0, clientIdentity.length, false)
  return concat(serverPublicKey, serIdLen, serverIdentity, cliIdLen, clientIdentity)
}

function createEnvelope(
  randomizedPwd: Uint8Array,
  serverPublicKey: Uint8Array,
  nonce: Uint8Array,
) {
  const { maskingKey, authKey, privateKeySeed } = deriveKeys(randomizedPwd, nonce)
  const keyPair = deriveAkeKeyPair(privateKeySeed)
  const cleartextCreds = serializeCleartextCreds(serverPublicKey, serverPublicKey, randomizedPwd)
  const hmacInput = concat(nonce, cleartextCreds)
  const authTag = hmac(sha256, authKey, hmacInput)
  return { clientPublicKey: keyPair.publicKey, maskingKey, nonce, authTag }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface OpaqueRegState {
  blind: Uint8Array
  password: Uint8Array
}

export interface OpaqueRegistrationResult {
  clientPublicKeyBase64: string
  maskingKeyBase64: string
  envelopeNonceBase64: string
  authTagBase64: string
}

export function opaqueRegisterStart(password: string): {
  blindedElementBase64: string
  state: OpaqueRegState
} {
  const passBytes = new TextEncoder().encode(password)
  const { blind, blinded } = OPRF.blind(passBytes)

  return {
    blindedElementBase64: bytesToBase64(blinded),
    state: { blind: new Uint8Array(blind), password: passBytes },
  }
}

export function opaqueRegisterFinish(
  state: OpaqueRegState,
  evaluatedElementBase64: string,
  serverPublicKeyBase64: string,
): OpaqueRegistrationResult {
  const evaluatedElement = base64ToBytes(evaluatedElementBase64)
  const serverPublicKey = base64ToBytes(serverPublicKeyBase64)

  const randomizedPwd = deriveRandomizedPwd(state.password, state.blind, evaluatedElement)

  const nonce = crypto.getRandomValues(new Uint8Array(Nh))

  const envelope = createEnvelope(randomizedPwd, serverPublicKey, nonce)

  return {
    clientPublicKeyBase64: bytesToBase64(envelope.clientPublicKey),
    maskingKeyBase64: bytesToBase64(envelope.maskingKey),
    envelopeNonceBase64: bytesToBase64(envelope.nonce),
    authTagBase64: bytesToBase64(envelope.authTag),
  }
}

export function credentialIdentifier(identity: string): string {
  const hash = sha256(new TextEncoder().encode(identity))
  return bytesToBase64(hash)
}

// ---------------------------------------------------------------------------
// Base64 helpers
// ---------------------------------------------------------------------------

function bytesToBase64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.byteLength; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary)
}

function base64ToBytes(str: string): Uint8Array {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
