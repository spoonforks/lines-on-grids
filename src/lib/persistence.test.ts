import { describe, expect, it } from 'vitest'
import { createDocument } from './document'
import { loadRecoverySnapshot, saveRecoverySnapshot } from './persistence'

describe('recovery persistence fallback', () => {
  it('remains safe when IndexedDB is unavailable', async () => {
    if (typeof indexedDB !== 'undefined') return

    await expect(loadRecoverySnapshot()).resolves.toBeNull()
    await expect(saveRecoverySnapshot({
      savedAt: Date.now(),
      document: createDocument(28, { width: 640, height: 480 }),
      activeStroke: {
        points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        style: { color: '#111111', lineWidth: 4 },
        brush: 'curve',
      },
      mirrorX: true,
      mirrorY: true,
    })).resolves.toBeUndefined()
  })
})
