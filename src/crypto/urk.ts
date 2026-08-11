import { argon2id } from '@noble/hashes/argon2.js'
import type { WorkerRequest } from '@/workers/crypto.worker'

// Unified URK KDF across platforms: Argon2id (m=16MB, t=2, p=1, dkLen=32)
// Must match the miniapp's libsodium derivation to decrypt the same account.
const ARGON2_MEM_KIB = 16384 // 16 MiB
const ARGON2_TIME = 2
const ARGON2_PARALLELISM = 1
const ARGON2_DKLEN = 32

const WORKER_AVAILABLE = typeof Worker !== 'undefined'

let worker: Worker | null = null

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('../workers/crypto.worker.ts', import.meta.url),
      { type: 'module' },
    )
  }
  return worker
}

function sendWorkerMessage<T>(op: WorkerRequest['op'], payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const w = getWorker()
    const id = crypto.randomUUID()

    const handler = (e: MessageEvent) => {
      if (e.data.id !== id) return
      w.removeEventListener('message', handler)
      if (e.data.error) {
        reject(new Error(e.data.error))
      } else {
        resolve(e.data.result as T)
      }
    }

    w.addEventListener('message', handler)
    w.postMessage({ id, op, payload } satisfies WorkerRequest)
  })
}

export async function deriveURKBits(masterPassword: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const passwordData = new TextEncoder().encode(masterPassword)

  const rawBits = argon2id(passwordData, salt, {
    t: ARGON2_TIME,
    m: ARGON2_MEM_KIB,
    p: ARGON2_PARALLELISM,
    dkLen: ARGON2_DKLEN,
  })

  passwordData.fill(0)

  return rawBits.buffer.slice(
    rawBits.byteOffset,
    rawBits.byteOffset + rawBits.byteLength,
  )
}

async function deriveURKRaw(masterPassword: string, salt: Uint8Array): Promise<ArrayBuffer> {
  if (WORKER_AVAILABLE) {
  const saltBuffer = new Uint8Array(salt).buffer
    return sendWorkerMessage<ArrayBuffer>('deriveURK', {
      password: masterPassword,
      salt: saltBuffer,
    })
  }
  return deriveURKBits(masterPassword, salt)
}

export async function deriveURK(masterPassword: string, salt: Uint8Array): Promise<CryptoKey> {
  const rawBytes = await deriveURKRaw(masterPassword, salt)

  const urk = await crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )

  new Uint8Array(rawBytes).fill(0)

  return urk
}

export function terminateWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
  }
}
