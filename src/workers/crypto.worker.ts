/**
 * Web Worker for CPU-intensive cryptographic operations
 *
 * Offloaded operations:
 *  - PBKDF2 (600K iterations) for URK derivation
 *  - Argon2id for URK derivation (when supported)
 *  - Bulk AES-GCM encrypt/decrypt for vault items
 */

export interface WorkerRequest {
  id: string
  op: 'deriveURK' | 'argon2id' | 'encryptBatch' | 'decryptBatch'
  payload: unknown
}

export interface WorkerResponse {
  id: string
  result?: unknown
  error?: string
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, op, payload } = e.data
  try {
    let result: unknown
    switch (op) {
      case 'deriveURK':
        result = await handleDeriveURK(payload)
        break
      case 'argon2id':
        result = await handleArgon2id(payload)
        break
      case 'encryptBatch':
        result = await handleEncryptBatch(payload)
        break
      case 'decryptBatch':
        result = await handleDecryptBatch(payload)
        break
      default:
        throw new Error(`Unknown op: ${op}`)
    }
    self.postMessage({ id, result } satisfies WorkerResponse)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    self.postMessage({ id, error: message } satisfies WorkerResponse)
  }
}

async function handleDeriveURK(_payload: unknown): Promise<unknown> {
  throw new Error('Not implemented — Phase 2.1.2')
}

async function handleArgon2id(_payload: unknown): Promise<unknown> {
  throw new Error('Not implemented — Phase 2.1.2')
}

async function handleEncryptBatch(_payload: unknown): Promise<unknown> {
  throw new Error('Not implemented — Phase 2.1.3')
}

async function handleDecryptBatch(_payload: unknown): Promise<unknown> {
  throw new Error('Not implemented — Phase 2.1.3')
}
