import type {
  BrushMode,
  CanvasSize,
  GridMetrics,
  GridPoint,
  ViewportState,
  WorldPoint,
} from '../types'

const GRID_CLICK_RADIUS = 14

export function getGridMetrics(spacing: number): GridMetrics {
  return {
    spacing: Math.max(8, Math.round(spacing)),
  }
}

export function gridPointToWorldPoint(point: GridPoint, metrics: GridMetrics): WorldPoint {
  return {
    x: point.x * metrics.spacing,
    y: point.y * metrics.spacing,
  }
}

export function worldPointToGridPoint(point: WorldPoint, metrics: GridMetrics): GridPoint {
  return {
    x: Math.round(point.x / metrics.spacing),
    y: Math.round(point.y / metrics.spacing),
  }
}

export function worldPointToScreenPoint(
  point: WorldPoint,
  canvas: CanvasSize,
  viewport: ViewportState,
) {
  return {
    x: canvas.width / 2 + (point.x - viewport.x) * viewport.zoom,
    y: canvas.height / 2 + (point.y - viewport.y) * viewport.zoom,
  }
}

export function screenPointToWorldPoint(
  screenX: number,
  screenY: number,
  canvas: CanvasSize,
  viewport: ViewportState,
): WorldPoint {
  return {
    x: viewport.x + (screenX - canvas.width / 2) / viewport.zoom,
    y: viewport.y + (screenY - canvas.height / 2) / viewport.zoom,
  }
}

export function snapScreenPointToGrid(
  screenX: number,
  screenY: number,
  canvas: CanvasSize,
  viewport: ViewportState,
  metrics: GridMetrics,
): GridPoint | null {
  const worldPoint = screenPointToWorldPoint(screenX, screenY, canvas, viewport)
  const gridPoint = worldPointToGridPoint(worldPoint, metrics)
  const snappedScreenPoint = worldPointToScreenPoint(
    gridPointToWorldPoint(gridPoint, metrics),
    canvas,
    viewport,
  )
  const distance = Math.hypot(screenX - snappedScreenPoint.x, screenY - snappedScreenPoint.y)

  return distance <= GRID_CLICK_RADIUS ? gridPoint : null
}

export function getVisibleGridBounds(
  canvas: CanvasSize,
  viewport: ViewportState,
  metrics: GridMetrics,
) {
  const topLeft = screenPointToWorldPoint(0, 0, canvas, viewport)
  const bottomRight = screenPointToWorldPoint(canvas.width, canvas.height, canvas, viewport)
  const padding = metrics.spacing * 2

  return {
    minX: Math.floor((topLeft.x - padding) / metrics.spacing),
    maxX: Math.ceil((bottomRight.x + padding) / metrics.spacing),
    minY: Math.floor((topLeft.y - padding) / metrics.spacing),
    maxY: Math.ceil((bottomRight.y + padding) / metrics.spacing),
  }
}

export function interpolateGridPoints(start: GridPoint, end: GridPoint): GridPoint[] {
  const points: GridPoint[] = []
  let currentX = start.x
  let currentY = start.y
  const deltaX = Math.abs(end.x - start.x)
  const deltaY = Math.abs(end.y - start.y)
  const stepX = start.x < end.x ? 1 : -1
  const stepY = start.y < end.y ? 1 : -1
  let error = deltaX - deltaY

  while (true) {
    points.push({ x: currentX, y: currentY })

    if (currentX === end.x && currentY === end.y) {
      return points
    }

    const doubledError = 2 * error

    if (doubledError > -deltaY) {
      error -= deltaY
      currentX += stepX
    }

    if (doubledError < deltaX) {
      error += deltaX
      currentY += stepY
    }
  }
}

export function appendSegmentPoints(
  path: GridPoint[],
  target: GridPoint,
  brush: BrushMode,
  preferDiagonal = false,
): GridPoint[] {
  if (path.length === 0) {
    return [target]
  }

  const lastPoint = path.at(-1)

  if (!lastPoint || areSamePoint(lastPoint, target)) {
    return path
  }

  const segmentPoints =
    brush === 'curve'
      ? buildCurveSegmentPoints(lastPoint, target)
      : buildDrawSegmentPoints(lastPoint, target, preferDiagonal)

  return [...path, ...segmentPoints.slice(1)]
}

export function buildDrawSegmentPoints(
  start: GridPoint,
  end: GridPoint,
  preferDiagonal = false,
): GridPoint[] {
  if (preferDiagonal) {
    return [start, end]
  }

  if (isStraightGridSegment(start, end)) {
    return [start, end]
  }

  const corner = getOrthogonalCorner(start, end)
  return areSamePoint(start, corner) || areSamePoint(corner, end)
    ? [start, end]
    : [start, corner, end]
}

export function buildCurveSegmentPoints(start: GridPoint, end: GridPoint): GridPoint[] {
  if (isSameAxis(start, end)) {
    return [start, end]
  }

  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const signX = Math.sign(deltaX) || 1
  const signY = Math.sign(deltaY) || 1
  const absX = Math.abs(deltaX)
  const absY = Math.abs(deltaY)
  const radius = Math.min(absX, absY)
  const horizontalFirst = absX >= absY

  if (radius === 0) {
    return interpolateGridPoints(start, end)
  }

  const leadStart = horizontalFirst
    ? { x: end.x - signX * radius, y: start.y }
    : { x: start.x, y: end.y - signY * radius }
  const leadEnd = horizontalFirst
    ? { x: end.x, y: start.y + signY * radius }
    : { x: start.x + signX * radius, y: end.y }
  const center = horizontalFirst
    ? { x: end.x - signX * radius, y: start.y + signY * radius }
    : { x: start.x + signX * radius, y: end.y - signY * radius }

  const segmentPoints: GridPoint[] = [start]
  if (!areSamePoint(start, leadStart)) segmentPoints.push(leadStart)

  const arcSamples = sampleQuarterArc(leadStart, leadEnd, center, radius)

  for (const point of arcSamples.slice(1)) {
    if (!areSamePoint(segmentPoints.at(-1), point)) {
      segmentPoints.push(point)
    }
  }

  if (!areSamePoint(segmentPoints.at(-1), end)) segmentPoints.push(end)

  return segmentPoints
}

export function isStraightGridSegment(start: GridPoint, end: GridPoint) {
  const deltaX = Math.abs(end.x - start.x)
  const deltaY = Math.abs(end.y - start.y)

  return deltaX === 0 || deltaY === 0 || deltaX === deltaY
}

export function getStrokeBounds(points: GridPoint[], metrics: GridMetrics) {
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    const worldPoint = gridPointToWorldPoint(point, metrics)
    minX = Math.min(minX, worldPoint.x)
    maxX = Math.max(maxX, worldPoint.x)
    minY = Math.min(minY, worldPoint.y)
    maxY = Math.max(maxY, worldPoint.y)
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
  }
}

export function getMirroredPointSets(points: GridPoint[], mirrorX: boolean, mirrorY: boolean) {
  const transforms: Array<(point: GridPoint) => GridPoint> = [
    (point) => ({ ...point }),
  ]

  if (mirrorX) transforms.push((point) => ({ x: -point.x, y: point.y }))
  if (mirrorY) transforms.push((point) => ({ x: point.x, y: -point.y }))
  if (mirrorX && mirrorY) transforms.push((point) => ({ x: -point.x, y: -point.y }))

  const pointSets: GridPoint[][] = []
  for (const transform of transforms) {
    const transformed = points.map(transform)
    const isDuplicate = pointSets.some((existing) => arePointSetsEqual(existing, transformed))
    if (!isDuplicate) pointSets.push(transformed)
  }

  return pointSets
}

function getOrthogonalCorner(start: GridPoint, end: GridPoint): GridPoint {
  const deltaX = Math.abs(end.x - start.x)
  const deltaY = Math.abs(end.y - start.y)

  return deltaX >= deltaY ? { x: end.x, y: start.y } : { x: start.x, y: end.y }
}

function sampleQuarterArc(
  start: GridPoint,
  end: GridPoint,
  center: GridPoint,
  radius: number,
) {
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x)
  let endAngle = Math.atan2(end.y - center.y, end.x - center.x)
  let sweep = endAngle - startAngle

  if (sweep <= -Math.PI) {
    sweep += Math.PI * 2
  } else if (sweep > Math.PI) {
    sweep -= Math.PI * 2
  }

  if (Math.abs(sweep) > Math.PI / 2 + 0.0001) {
    sweep += sweep > 0 ? -Math.PI * 2 : Math.PI * 2
  }

  // Four samples per grid unit is visually smooth at normal zoom levels while
  // preventing long mirrored curve sessions from creating millions of points.
  const steps = Math.max(8, Math.min(48, Math.ceil(radius * 4)))
  const sampledPoints: GridPoint[] = []

  for (let step = 0; step <= steps; step += 1) {
    const angle = startAngle + (sweep * step) / steps
    const nextPoint = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    }

    if (Number.isFinite(nextPoint.x) && Number.isFinite(nextPoint.y)) {
      sampledPoints.push(nextPoint)
    }
  }

  if (sampledPoints.length < 2) {
    return [start, end]
  }

  return sampledPoints
}

function isSameAxis(start: GridPoint, end: GridPoint) {
  return start.x === end.x || start.y === end.y
}

function areSamePoint(first: GridPoint | undefined, second: GridPoint | undefined) {
  return first?.x === second?.x && first?.y === second?.y
}

function arePointSetsEqual(first: GridPoint[], second: GridPoint[]) {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index += 1) {
    if (!areSamePoint(first[index], second[index])) return false
  }
  return true
}
