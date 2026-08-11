/**
 * Web Worker for CPU-intensive cryptographic operations
 *
 * Offloaded operation:
 *  - Argon2id (16MB / t=2 / p=1) for URK derivation
 *
 * Batch encryption/decryption runs on the main thread via Promise.all
 * (AES-GCM is fast enough that worker serialization overhead outweighs benefit).
 */

import { argon2id } from '@noble/hashes/argon2.js'

export interface WorkerRequest {
  id: string
  op: 'deriveURK'
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

const ARGON2_MEM_KIB = 16384 // 16 MiB
const ARGON2_TIME = 2
const ARGON2_PARALLELISM = 1
const ARGON2_DKLEN = 32

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, op, payload } = e.data
  try {
    let result: unknown
    switch (op) {
      case 'deriveURK':
        result = await handleDeriveURK(payload as DeriveURKPayload)
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

  const key = argon2id(passwordData, new Uint8Array(salt), {
    t: ARGON2_TIME,
    m: ARGON2_MEM_KIB,
    p: ARGON2_PARALLELISM,
    dkLen: ARGON2_DKLEN,
  })

  passwordData.fill(0)

  return key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength)
}
