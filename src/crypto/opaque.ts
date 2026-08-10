/**
 * Hofmann OPAQUE client — RFC 9497 OPRF + RFC 9807 OPAQUE-3DH
 *
 * Protocol (Hofmann variant with HMAC-based envelope + 3DH AKE):
 *
 * Registration:
 *   1) OPRF blind(password) → { blind, blindedElement }
 *   2) Server: blindEvaluate(key, blindedElement) → evaluatedElement
 *   3) OPRF finalize → oprfOutput
 *   4) HKDF-Extract(zero, oprfOutput || Argon2id(oprfOutput, ctx, 3, 65536, 1)) → randomizedPwd
 *   5) Derive keys from randomizedPwd + nonce → maskingKey, authKey, exportKey, privateKeySeed
 *   6) deriveAkeKeyPair(privateKeySeed) → (skU, pkU)
 *   7) HMAC(authKey, nonce || serializedCleartextCreds) → authTag
 *   8) Return { clientPublicKey, maskingKey, envelope: { nonce, authTag } }
 *
 * Login (3-message AKE):
 *   KE1: blind password + ephemeral AKE key pair + client nonce
 *   KE2: Server evaluates OPRF, masks credentials, generates server AKE keys, computes MAC
 *   KE3: Client recovers envelope → 3DH → verifies server MAC → computes client MAC
 *
 * Identity convention (matches Hofmann defaults):
 *   serverIdentity → serverPublicKey (when null)
 *   clientIdentity → clientPublicKey (when null)
 */

import { p256_oprf, p256 } from '@noble/curves/nist.js'
import { argon2id } from '@noble/hashes/argon2.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { hmac } from '@noble/hashes/hmac.js'
import { extract, expand } from '@noble/hashes/hkdf.js'

const OPRF = p256_oprf.oprf
const CTX = new TextEncoder().encode('sky-pivot-v1')
const Nh = 32
const Npk = 33
const Nsk = 32
const Nn = 32

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

// ---------------------------------------------------------------------------
// HKDF helpers (matching Hofmann OpaqueCipherSuite)
// ---------------------------------------------------------------------------

function hkdfExtractZeros(ikm: Uint8Array, len: number = Nh): Uint8Array {
  return hmac(sha256, new Uint8Array(len), ikm)
}

function hkdfExpandStd(prk: Uint8Array, info: Uint8Array, len: number): Uint8Array {
  return expand(sha256, prk, info, len)
}

/**
 * HKDF-Expand-Label per RFC 9807 (OPAQUE TLS-style).
 * Full label = "OPAQUE-" + label
 * info = I2OSP(length, 2) || I2OSP(fullLabel.length, 1) || fullLabel || I2OSP(context.length, 1) || context
 */
function hkdfExpandLabel(
  secret: Uint8Array,
  label: string,
  context: Uint8Array,
  length: number,
): Uint8Array {
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
  return hkdfExpandStd(secret, info, length)
}

// ---------------------------------------------------------------------------
// P-256 ECDH (x-coordinate only, matching ByteUtils.dhECDH)
// ---------------------------------------------------------------------------

function ecdh(privateScalar: Uint8Array, publicKeyBytes: Uint8Array): Uint8Array {
  const shared = p256.getSharedSecret(privateScalar, publicKeyBytes) as Uint8Array
  return shared.slice(0, 32) as Uint8Array
}

// ---------------------------------------------------------------------------
// Derive AKE key pair from seed (matching OpaqueCipherSuite.deriveAkeKeyPair)
// ---------------------------------------------------------------------------

function deriveAkeKeyPair(privateKeySeed: Uint8Array): { publicKey: Uint8Array; privateKey: Uint8Array } {
  const prk = hkdfExtractZeros(privateKeySeed)
  const info = new TextEncoder().encode('OPAQUE-DeriveDiffieHellmanKeyPair')
  const rawScalar = hkdfExpandStd(prk, info, Nsk)
  const publicKey = p256.getPublicKey(rawScalar, true)
  return { publicKey, privateKey: rawScalar }
}

// ---------------------------------------------------------------------------
// Core OPAQUE functions
// ---------------------------------------------------------------------------

function deriveRandomizedPwd(
  password: Uint8Array,
  blind: Uint8Array,
  evaluatedElement: Uint8Array,
): Uint8Array {
  const oprfOutput = OPRF.finalize(password, blind, evaluatedElement)
  const stretched = argon2id(oprfOutput, CTX, { t: 3, m: 65536, p: 1, dkLen: Nh })
  return extract(sha256, concat(oprfOutput, stretched), new Uint8Array(Nh))
}

/**
 * Derive keys from randomizedPwd and nonce.
 * Returns { maskingKey, authKey, exportKey, privateKeySeed }.
 */
function deriveKeys(randomizedPwd: Uint8Array, nonce: Uint8Array) {
  const maskingKey = expand(sha256, randomizedPwd, concat(new TextEncoder().encode('MaskingKey')), Nh)
  const authKey = expand(sha256, randomizedPwd, concat(nonce, new TextEncoder().encode('AuthKey')), Nh)
  const exportKey = expand(sha256, randomizedPwd, concat(nonce, new TextEncoder().encode('ExportKey')), Nh)
  const privateKeySeed = expand(sha256, randomizedPwd, concat(nonce, new TextEncoder().encode('PrivateKey')), Nsk)
  return { maskingKey, authKey, exportKey, privateKeySeed }
}

function serializeCleartextCreds(
  serverPublicKey: Uint8Array,
  serverIdentity: Uint8Array,
  clientIdentity: Uint8Array,
): Uint8Array {
  const serIdLen = i2osp(serverIdentity.length, 2)
  const cliIdLen = i2osp(clientIdentity.length, 2)
  return concat(serverPublicKey, serIdLen, serverIdentity, cliIdLen, clientIdentity)
}

function createEnvelope(
  randomizedPwd: Uint8Array,
  serverPublicKey: Uint8Array,
  nonce: Uint8Array,
) {
  const { maskingKey, authKey, privateKeySeed } = deriveKeys(randomizedPwd, nonce)
  const keyPair = deriveAkeKeyPair(privateKeySeed)
  const cleartextCreds = serializeCleartextCreds(serverPublicKey, serverPublicKey, keyPair.publicKey)
  const hmacInput = concat(nonce, cleartextCreds)
  const authTag = hmac(sha256, authKey, hmacInput)
  return { clientPublicKey: keyPair.publicKey, maskingKey, nonce, authTag }
}

/**
 * Recover the envelope from randomizedPwd and masked credential response.
 * Returns { clientPrivateKeyBytes, clientPublicKey, cleartextCredentials, exportKey, serverPublicKey }.
 */
function recoverEnvelope(
  randomizedPwd: Uint8Array,
  maskingNonce: Uint8Array,
  maskedResponse: Uint8Array,
  serverIdentity: Uint8Array | null,
  clientIdentity: Uint8Array | null,
) {
  const maskingKey = expand(sha256, randomizedPwd, new TextEncoder().encode('MaskingKey'), Nh)

  const padInfo = concat(maskingNonce, new TextEncoder().encode('CredentialResponsePad'))
  const pad = expand(sha256, maskingKey, padInfo, Npk + Nn + Nh)

  const plaintext = new Uint8Array(maskedResponse.length)
  for (let i = 0; i < maskedResponse.length; i++) {
    plaintext[i] = maskedResponse[i] ^ pad[i]
  }

  const serverPublicKey = plaintext.slice(0, Npk)
  const envelopeNonce = plaintext.slice(Npk, Npk + Nn)
  const authTag = plaintext.slice(Npk + Nn, Npk + Nn + Nh)

  const { authKey, exportKey, privateKeySeed } = deriveKeys(randomizedPwd, envelopeNonce)
  const keyPair = deriveAkeKeyPair(privateKeySeed)

  const si = serverIdentity ?? serverPublicKey
  const ci = clientIdentity ?? keyPair.publicKey

  const cleartextCreds = serializeCleartextCreds(serverPublicKey, si, ci)
  const hmacInput = concat(envelopeNonce, cleartextCreds)
  const expectedTag = hmac(sha256, authKey, hmacInput)

  if (!constantTimeEqual(expectedTag, authTag)) {
    throw new Error('Authentication failed: envelope auth tag mismatch')
  }

  return {
    clientPrivateKeyBytes: keyPair.privateKey,
    clientPublicKey: keyPair.publicKey,
    serverPublicKey,
    cleartextCredentials: { serverPublicKey, serverIdentity: si, clientIdentity: ci },
    exportKey,
  }
}

// ---------------------------------------------------------------------------
// Public API — Registration
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
  const { blind: blindBytes, blinded } = OPRF.blind(passBytes)

  return {
    blindedElementBase64: bytesToBase64(blinded),
    state: { blind: new Uint8Array(blindBytes), password: passBytes },
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
// Public API — Login
// ---------------------------------------------------------------------------

export interface OpaqueLoginState {
  blind: Uint8Array
  password: Uint8Array
  blindedElement: Uint8Array
  clientNonce: Uint8Array
  clientAkePublicKey: Uint8Array
  clientAkePrivateKey: Uint8Array
}

export interface OpaqueLoginStartResult {
  blindedElementBase64: string
  clientNonceBase64: string
  clientAkePublicKeyBase64: string
  state: OpaqueLoginState
}

export interface OpaqueLoginFinishInput {
  evaluatedElementBase64: string
  maskingNonceBase64: string
  maskedResponseBase64: string
  serverNonceBase64: string
  serverAkePublicKeyBase64: string
  serverMacBase64: string
}

export interface OpaqueLoginFinishResult {
  clientMacBase64: string
  sessionKey: Uint8Array
  exportKey: Uint8Array
}

/**
 * OPAQUE login KE1: blind password + generate ephemeral AKE key pair + client nonce.
 */
export function opaqueLoginStart(password: string): OpaqueLoginStartResult {
  const passBytes = new TextEncoder().encode(password)

  const { blind: blindBytes, blinded } = OPRF.blind(passBytes)

  const clientAkeKeySeed = crypto.getRandomValues(new Uint8Array(Nsk))
  const clientAkeKp = deriveAkeKeyPair(clientAkeKeySeed)

  const clientNonce = crypto.getRandomValues(new Uint8Array(Nn))

  return {
    blindedElementBase64: bytesToBase64(blinded),
    clientNonceBase64: bytesToBase64(clientNonce),
    clientAkePublicKeyBase64: bytesToBase64(clientAkeKp.publicKey),
    state: {
      blind: new Uint8Array(blindBytes),
      password: passBytes,
      blindedElement: new Uint8Array(blinded),
      clientNonce,
      clientAkePublicKey: clientAkeKp.publicKey,
      clientAkePrivateKey: clientAkeKp.privateKey,
    },
  }
}

/**
 * OPAQUE login KE3: recover envelope → 3DH → verify server MAC → compute client MAC.
 */
export function opaqueLoginFinish(
  state: OpaqueLoginState,
  input: OpaqueLoginFinishInput,
): OpaqueLoginFinishResult {
  const evaluatedElement = base64ToBytes(input.evaluatedElementBase64)
  const maskingNonce = base64ToBytes(input.maskingNonceBase64)
  const maskedResponse = base64ToBytes(input.maskedResponseBase64)
  const serverNonce = base64ToBytes(input.serverNonceBase64)
  const serverAkePublicKey = base64ToBytes(input.serverAkePublicKeyBase64)
  const serverMac = base64ToBytes(input.serverMacBase64)

  const randomizedPwd = deriveRandomizedPwd(state.password, state.blind, evaluatedElement)

  const recovered = recoverEnvelope(randomizedPwd, maskingNonce, maskedResponse, null, null)

  const cId = recovered.clientPublicKey
  const sId = recovered.serverPublicKey

  const ke1Bytes = concat(state.blindedElement, state.clientNonce, state.clientAkePublicKey)
  const credResponseBytes = concat(evaluatedElement, maskingNonce, maskedResponse)

  const preamble = concat(
    new TextEncoder().encode('OPAQUEv1-'),
    i2osp(CTX.length, 2),
    CTX,
    i2osp(cId.length, 2),
    cId,
    ke1Bytes,
    i2osp(sId.length, 2),
    sId,
    credResponseBytes,
    serverNonce,
    serverAkePublicKey,
  )

  const preambleHash = sha256(preamble)

  const serverAkePk = base64ToBytes(input.serverAkePublicKeyBase64)
  const serverLtPk = recovered.serverPublicKey

  const dh1 = ecdh(state.clientAkePrivateKey, serverAkePk)
  const dh2 = ecdh(state.clientAkePrivateKey, serverLtPk)
  const dh3 = ecdh(recovered.clientPrivateKeyBytes, serverAkePk)
  const ikm = concat(dh1, dh2, dh3)

  const prk = hkdfExtractZeros(ikm, Nh)

  const handshakeSecret = hkdfExpandLabel(prk, 'HandshakeSecret', preambleHash, Nh)
  const sessionKey = hkdfExpandLabel(prk, 'SessionKey', preambleHash, Nh)
  const km2 = hkdfExpandLabel(handshakeSecret, 'ServerMAC', new Uint8Array(0), Nh)
  const km3 = hkdfExpandLabel(handshakeSecret, 'ClientMAC', new Uint8Array(0), Nh)

  const expectedServerMac = hmac(sha256, km2, preambleHash)

  if (!constantTimeEqual(expectedServerMac, serverMac)) {
    throw new Error('Authentication failed: server MAC mismatch')
  }

  const clientMac = hmac(sha256, km3, sha256(concat(preamble, serverMac)))

  return {
    clientMacBase64: bytesToBase64(clientMac),
    sessionKey,
    exportKey: recovered.exportKey,
  }
}

// ---------------------------------------------------------------------------
// Base64 + utility helpers
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

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i]
  }
  return diff === 0
}
