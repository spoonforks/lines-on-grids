import type { GridPoint, ShapeMode } from '../types'

export const MIN_SHAPE_SIZE = 2
export const MAX_SHAPE_SIZE = 24
export const SHAPE_SIZE_STEP = 2

export function normalizeShapeSize(size: number) {
  if (!Number.isFinite(size)) return MIN_SHAPE_SIZE
  const clamped = Math.min(MAX_SHAPE_SIZE, Math.max(MIN_SHAPE_SIZE, Math.round(size)))
  return clamped % SHAPE_SIZE_STEP === 0 ? clamped : clamped + (clamped === MAX_SHAPE_SIZE ? -1 : 1)
}

export function createShapePoints(center: GridPoint, shape: ShapeMode, size: number): GridPoint[] {
  const radius = normalizeShapeSize(size) / 2
  const { x, y } = center

  switch (shape) {
    case 'square':
      return closeShape([
        { x: x - radius, y: y - radius },
        { x: x + radius, y: y - radius },
        { x: x + radius, y: y + radius },
        { x: x - radius, y: y + radius },
      ])
    case 'diamond':
      return closeShape([
        { x, y: y - radius },
        { x: x + radius, y },
        { x, y: y + radius },
        { x: x - radius, y },
      ])
    case 'triangle':
      return closeShape([
        { x, y: y - radius },
        { x: x + radius, y: y + radius },
        { x: x - radius, y: y + radius },
      ])
    case 'circle':
      return createCirclePoints(center, radius)
  }
}

function createCirclePoints(center: GridPoint, radius: number) {
  // The sample count is bounded to keep preview and mirrored placement cheap,
  // while scaling enough for clean outlines at larger grid sizes.
  const sampleCount = Math.max(24, Math.min(96, radius * 16))
  const points: GridPoint[] = []

  for (let index = 0; index < sampleCount; index += 1) {
    if (index === 0) {
      points.push({ x: center.x, y: center.y - radius })
      continue
    }
    if (index === sampleCount / 4) {
      points.push({ x: center.x + radius, y: center.y })
      continue
    }
    if (index === sampleCount / 2) {
      points.push({ x: center.x, y: center.y + radius })
      continue
    }
    if (index === sampleCount * 3 / 4) {
      points.push({ x: center.x - radius, y: center.y })
      continue
    }
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / sampleCount
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    })
  }

  return closeShape(points)
}

function closeShape(points: GridPoint[]) {
  if (points.length === 0) return points
  return [...points, { ...points[0] }]
}
