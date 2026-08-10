import type { WorkerRequest } from '@/workers/crypto.worker'

const PBKDF2_ITERATIONS = 600_000
const PBKDF2_HASH = 'SHA-512'
const DERIVED_KEY_BITS = 256

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
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    DERIVED_KEY_BITS,
  )

  return rawBits
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
