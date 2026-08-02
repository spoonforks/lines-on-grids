import { describe, expect, it } from 'vitest'
import { hexToHsl, hslToHex, normalizeHexColor } from './color'

describe('color conversion', () => {
  it('normalizes three and six digit hex colors', () => {
    expect(normalizeHexColor('#3af')).toBe('#33aaff')
    expect(normalizeHexColor('#3157D5')).toBe('#3157d5')
    expect(normalizeHexColor('blue')).toBeNull()
  })

  it('round-trips document colors through HSL', () => {
    for (const color of ['#111111', '#ffffff', '#3157d5', '#e24a3b', '#278761']) {
      expect(hslToHex(hexToHsl(color))).toBe(color)
    }
  })
})
