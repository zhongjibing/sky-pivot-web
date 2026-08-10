/**
 * Web Worker for CPU-intensive cryptographic operations
 *
 * Offloaded operations:
 *  - PBKDF2 (600K iterations) for URK derivation
 *  - Argon2id for URK derivation (when supported)
 *
 * Batch encryption/decryption runs on the main thread via Promise.all
 * (AES-GCM is fast enough that worker serialization overhead outweighs benefit).
 */

export interface WorkerRequest {
  id: string
  op: 'deriveURK' | 'argon2id'
  payload: unknown
}

export interface WorkerResponse {
  id: string
  result?: unknown
  error?: string
}

export interface DeriveURKPayload {
  password: string
  salt: ArrayBuffer
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, op, payload } = e.data
  try {
    let result: unknown
    switch (op) {
      case 'deriveURK':
        result = await handleDeriveURK(payload as DeriveURKPayload)
        break
      case 'argon2id':
        result = await handleArgon2id(payload)
        break
      default:
        throw new Error(`Unknown op: ${op}`)
    }
    const response: WorkerResponse = { id, result }
    self.postMessage(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const response: WorkerResponse = { id, error: message }
    self.postMessage(response)
  }
}

async function handleDeriveURK(payload: DeriveURKPayload): Promise<ArrayBuffer> {
  const { password, salt } = payload
  const passwordData = new TextEncoder().encode(password)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveBits'],
  )

  passwordData.fill(0)

  const rawBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 600_000,
      hash: 'SHA-512',
    },
    keyMaterial,
    256,
  )

  return rawBits
}

async function handleArgon2id(_payload: unknown): Promise<unknown> {
  throw new Error('Argon2id not implemented — Web Crypto API does not support Argon2')
}
