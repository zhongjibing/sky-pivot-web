/**
 * Ed25519 device key management
 *
 * Each device generates an Ed25519 keypair at registration.
 * The private key NEVER leaves the device.
 * The public key is uploaded to the server for AT verification.
 */

export interface DeviceKeyPair {
  publicKey: Uint8Array
  privateKey: CryptoKey
}

export async function generateDeviceKeyPair(): Promise<DeviceKeyPair> {
  throw new Error('Not implemented — Phase 2.1.6')
}

export async function exportPublicKey(key: CryptoKeyPair): Promise<Uint8Array> {
  throw new Error('Not implemented — Phase 2.1.6')
}

export async function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  throw new Error('Not implemented — Phase 2.1.6')
}
