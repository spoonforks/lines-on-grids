import { describe, expect, it } from 'vitest'
import { createShapePoints, normalizeShapeSize } from './shapes'

describe('shape geometry', () => {
  it('creates a closed square whose corners sit on grid points', () => {
    expect(createShapePoints({ x: 3, y: -2 }, 'square', 4)).toEqual([
      { x: 1, y: -4 },
      { x: 5, y: -4 },
      { x: 5, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: -4 },
    ])
  })

  it('creates closed diamond and triangle outlines on the grid', () => {
    expect(createShapePoints({ x: 0, y: 0 }, 'diamond', 6)).toEqual([
      { x: 0, y: -3 },
      { x: 3, y: 0 },
      { x: 0, y: 3 },
      { x: -3, y: 0 },
      { x: 0, y: -3 },
    ])
    expect(createShapePoints({ x: 0, y: 0 }, 'triangle', 4)).toEqual([
      { x: 0, y: -2 },
      { x: 2, y: 2 },
      { x: -2, y: 2 },
      { x: 0, y: -2 },
    ])
  })

  it('creates a bounded, closed circle with exact grid cardinal points', () => {
    const points = createShapePoints({ x: 5, y: 7 }, 'circle', 8)
    expect(points.length).toBeLessThanOrEqual(97)
    expect(points[0]).toEqual({ x: 5, y: 3 })
    expect(points.at(-1)).toEqual(points[0])
    expect(points).toContainEqual({ x: 9, y: 7 })
    expect(points).toContainEqual({ x: 5, y: 11 })
    expect(points).toContainEqual({ x: 1, y: 7 })
    for (const point of points) {
      expect(Math.hypot(point.x - 5, point.y - 7)).toBeCloseTo(4, 10)
    }
  })

  it('clamps shape sizes to supported even cell widths', () => {
    expect(normalizeShapeSize(Number.NaN)).toBe(2)
    expect(normalizeShapeSize(1)).toBe(2)
    expect(normalizeShapeSize(5)).toBe(6)
    expect(normalizeShapeSize(25)).toBe(24)
  })
})
