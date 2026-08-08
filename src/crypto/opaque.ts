/**
 * Hofmann OPAQUE client — password-authenticated key exchange
 *
 * Implements the client side of the OPAQUE protocol:
 *  1) Registration: password → (Envelope, publicKey) → POST /api/opaque/register
 *  2) Login: password → ke1 → POST /api/opaque/login-start → ke2 → ke3 → sessionKey
 *
 * References:
 *  - RFC 9462 (OPAQUE)
 *  - Hofmann variant (deterministic envelope nonce)
 *  - libsodium / Web Crypto API for underlying ops
 */

export interface OpaqueRegistration {
  envelope: Uint8Array
  publicKey: Uint8Array
}

export interface OpaqueLoginState {
  state: ArrayBuffer
  ke1: Uint8Array
}

export interface OpaqueLoginResult {
  sessionKey: Uint8Array
  ke3: Uint8Array
}

export async function opaqueRegister(password: string): Promise<OpaqueRegistration> {
  throw new Error('Not implemented — Phase 2.1.2')
}

export async function opaqueLoginStart(password: string): Promise<OpaqueLoginState> {
  throw new Error('Not implemented — Phase 2.1.2')
}

export async function opaqueLoginFinish(
  state: ArrayBuffer,
  ke2: Uint8Array,
): Promise<OpaqueLoginResult> {
  throw new Error('Not implemented — Phase 2.1.2')
}
