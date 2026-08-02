import { describe, expect, it } from 'vitest'
import { getAdjacentAntialiasedPixelIndexes, getFloodFillRegion, isDitherPixelVisible } from './rendering'

function createImageData(width: number, height: number, pixels: number[]) {
  return {
    width,
    height,
    data: new Uint8ClampedArray(pixels),
  } as ImageData
}

describe('getFloodFillRegion', () => {
  it('detects enclosed regions without touching the canvas edge', () => {
    const imageData = createImageData(5, 5, [
      0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
      0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255,
      0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255,
      0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255,
      0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
    ])

    const region = getFloodFillRegion(imageData, 1, 1)

    expect(region?.touchesBoundary).toBe(false)
    expect(region?.pixelIndexes.length).toBe(8)
  })

  it('detects regions that spill to the canvas edge', () => {
    const imageData = createImageData(4, 4, [
      255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255,
    ])

    const region = getFloodFillRegion(imageData, 0, 0)

    expect(region?.touchesBoundary).toBe(true)
    expect(region?.pixelIndexes.length).toBe(8)
  })

  it('identifies antialiased boundary pixels without crossing into the neighboring region', () => {
    const pixels: number[] = []
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const isCenter = x === 2 && y === 2
        const isEdge = x >= 1 && x <= 3 && y >= 1 && y <= 3 && !isCenter
        pixels.push(0, 0, 0, isCenter ? 0 : isEdge ? 128 : 0)
      }
    }
    const imageData = createImageData(5, 5, pixels)
    const region = getFloodFillRegion(imageData, 2, 2)
    const edgePixels = getAdjacentAntialiasedPixelIndexes(imageData, region?.pixelIndexes ?? new Int32Array())

    expect(region?.pixelIndexes.length).toBe(1)
    expect(edgePixels).toHaveLength(8)
    expect(edgePixels.every((pixelIndex) => imageData.data[pixelIndex + 3] === 128)).toBe(true)
  })
})

describe('dither patterns', () => {
  it('uses predictable 25%, 50%, and 75% ordered-dither densities', () => {
    const countVisible = (pattern: 'bayer25' | 'bayer50' | 'bayer75') => {
      let visible = 0
      for (let y = 0; y < 4; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          if (isDitherPixelVisible(pattern, x * 3, y * 3)) visible += 1
        }
      }
      return visible
    }

    expect(countVisible('bayer25')).toBe(4)
    expect(countVisible('bayer50')).toBe(8)
    expect(countVisible('bayer75')).toBe(12)
  })

  it('keeps line and stipple patterns stable across negative world coordinates', () => {
    expect(typeof isDitherPixelVisible('diagonal', -18, -9)).toBe('boolean')
    expect(typeof isDitherPixelVisible('crosshatch', -18, -9)).toBe('boolean')
    expect(isDitherPixelVisible('stipple', -18, -9)).toBe(isDitherPixelVisible('stipple', -18, -9))
  })
})
