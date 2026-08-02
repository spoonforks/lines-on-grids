import { describe, expect, it } from 'vitest'
import {
  appendSegmentPoints,
  buildCurveSegmentPoints,
  buildDrawSegmentPoints,
  getMirroredPointSets,
  interpolateGridPoints,
  isStraightGridSegment,
} from './grid'

describe('interpolateGridPoints', () => {
  it('handles horizontal segments', () => {
    expect(interpolateGridPoints({ x: 1, y: 3 }, { x: 4, y: 3 })).toEqual([
      { x: 1, y: 3 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
    ])
  })

  it('handles vertical segments', () => {
    expect(interpolateGridPoints({ x: 2, y: 1 }, { x: 2, y: 4 })).toEqual([
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 2, y: 4 },
    ])
  })

  it('handles diagonal segments', () => {
    expect(interpolateGridPoints({ x: 1, y: 1 }, { x: 4, y: 4 })).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
      { x: 4, y: 4 },
    ])
  })
})

describe('draw tool pathing', () => {
  it('keeps axis and 45-degree segments straight', () => {
    expect(isStraightGridSegment({ x: 1, y: 1 }, { x: 1, y: 4 })).toBe(true)
    expect(isStraightGridSegment({ x: 1, y: 1 }, { x: 4, y: 4 })).toBe(true)
  })

  it('creates a single right angle for off-angle segments', () => {
    expect(buildDrawSegmentPoints({ x: 0, y: 0 }, { x: 4, y: 2 })).toEqual([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
    ])
  })

  it('stores long straight segments as endpoints instead of expanding every grid point', () => {
    expect(buildDrawSegmentPoints({ x: 0, y: 0 }, { x: 100_000, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 100_000, y: 0 },
    ])
  })
})

describe('curve brush pathing', () => {
  it('builds an elbow arc between the two dots', () => {
    const points = buildCurveSegmentPoints({ x: 0, y: 0 }, { x: 4, y: 2 })

    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points.at(-1)).toEqual({ x: 4, y: 2 })
    expect(points.length).toBeGreaterThan(8)
    expect(points[1]?.y).toBe(0)
    expect(points.some((point) => point.x > 3.5 && point.y < 2)).toBe(true)
  })

  it('stays stable for axis-aligned curve inputs', () => {
    expect(buildCurveSegmentPoints({ x: 1, y: 1 }, { x: 1, y: 5 })).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 5 },
    ])
  })

  it('bounds huge curve segments without interpolating their straight leads', () => {
    const points = buildCurveSegmentPoints({ x: 0, y: 0 }, { x: 100_000, y: 40_000 })

    expect(points.length).toBeLessThanOrEqual(52)
    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points.at(-1)).toEqual({ x: 100_000, y: 40_000 })
  })

  it('extends an existing curve path without repeating the last point', () => {
    const points = appendSegmentPoints(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      { x: 3, y: 2 },
      'curve',
    )

    expect(points[0]).toEqual({ x: 0, y: 0 })
    expect(points[1]).toEqual({ x: 1, y: 0 })
    expect(points.at(-1)).toEqual({ x: 3, y: 2 })
    expect(points.length).toBeGreaterThan(8)
  })
})

describe('mirror geometry', () => {
  it('creates X, Y, and combined mirrored point sets', () => {
    const points = [{ x: 1, y: 2 }, { x: 3, y: 4 }]
    expect(getMirroredPointSets(points, true, true)).toEqual([
      points,
      [{ x: -1, y: 2 }, { x: -3, y: 4 }],
      [{ x: 1, y: -2 }, { x: 3, y: -4 }],
      [{ x: -1, y: -2 }, { x: -3, y: -4 }],
    ])
  })

  it('deduplicates strokes that sit directly on a symmetry axis', () => {
    const vertical = [{ x: 0, y: 1 }, { x: 0, y: 4 }]
    expect(getMirroredPointSets(vertical, true, false)).toHaveLength(1)
  })

  it('deduplicates closed symmetric outlines regardless of traversal direction', () => {
    const square = [
      { x: -2, y: -2 },
      { x: 2, y: -2 },
      { x: 2, y: 2 },
      { x: -2, y: 2 },
      { x: -2, y: -2 },
    ]
    expect(getMirroredPointSets(square, true, true)).toHaveLength(1)
  })
})
