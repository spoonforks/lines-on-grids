import type { DrawingDocument, StrokeDraft, ToolMode } from '../types'

export interface RecoverySnapshot {
  savedAt: number
  document: DrawingDocument
  activeStroke?: StrokeDraft | null
  mirrorX?: boolean
  mirrorY?: boolean
  selectedTool?: ToolMode
}

const DATABASE_NAME = 'lines-on-grids-recovery'
const DATABASE_VERSION = 1
const STORE_NAME = 'snapshots'
const CURRENT_KEY = 'current'
const PREVIOUS_KEY = 'previous'

let databasePromise: Promise<IDBDatabase> | null = null
let pendingSnapshot: RecoverySnapshot | null = null
let saveInProgress: Promise<void> | null = null

export async function loadRecoverySnapshot(): Promise<RecoverySnapshot | null> {
  if (typeof indexedDB === 'undefined') return null

  try {
    const database = await openDatabase()
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const [current, previous] = await Promise.all([
      requestResult<RecoverySnapshot | undefined>(store.get(CURRENT_KEY)),
      requestResult<RecoverySnapshot | undefined>(store.get(PREVIOUS_KEY)),
    ])
    return [current, previous]
      .filter(isValidSnapshot)
      .sort((first, second) => second.savedAt - first.savedAt)[0] ?? null
  } catch {
    return null
  }
}

export function saveRecoverySnapshot(snapshot: RecoverySnapshot): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve()

  pendingSnapshot = snapshot
  if (!saveInProgress) {
    saveInProgress = drainPendingSnapshots().finally(() => {
      saveInProgress = null
      if (pendingSnapshot) void saveRecoverySnapshot(pendingSnapshot)
    })
  }
  return saveInProgress
}

async function drainPendingSnapshots() {
  while (pendingSnapshot) {
    const snapshot = pendingSnapshot
    pendingSnapshot = null
    await writeRecoverySnapshot(snapshot)
  }
}

async function writeRecoverySnapshot(snapshot: RecoverySnapshot) {
  const database = await openDatabase()
  const current = await readSnapshot(database, CURRENT_KEY)
  const transaction = database.transaction(STORE_NAME, 'readwrite')
  const store = transaction.objectStore(STORE_NAME)
  if (current) store.put(current, PREVIOUS_KEY)
  store.put(snapshot, CURRENT_KEY)
  await transactionComplete(transaction)
}

async function readSnapshot(database: IDBDatabase, key: string) {
  const transaction = database.transaction(STORE_NAME, 'readonly')
  return requestResult<RecoverySnapshot | undefined>(transaction.objectStore(STORE_NAME).get(key))
}

function openDatabase() {
  if (databasePromise) return databasePromise

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open recovery storage.'))
  })
  return databasePromise
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Recovery storage request failed.'))
  })
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Recovery storage transaction failed.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Recovery storage transaction aborted.'))
  })
}

function isValidSnapshot(snapshot: RecoverySnapshot | undefined): snapshot is RecoverySnapshot {
  return Boolean(
    snapshot &&
    Number.isFinite(snapshot.savedAt) &&
    snapshot.document?.version === 5 &&
    Array.isArray(snapshot.document.layers) &&
    snapshot.document.layers.length > 0,
  )
}
