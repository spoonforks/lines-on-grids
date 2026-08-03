import type { DrawingDocument, FillRegion, GridPoint, Stroke } from '../types'

export interface GridSelectionBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface ContentSelection {
  bounds: GridSelectionBounds
  strokeIds: string[]
  fillIds: string[]
}

export interface SelectionClipboard {
  bounds: GridSelectionBounds
  strokes: Stroke[]
  fills: FillRegion[]
}

export type SelectionTransform = 'rotate90' | 'flipHorizontal' | 'flipVertical'

export function normalizeSelectionBounds(start: GridPoint, end: GridPoint): GridSelectionBounds {
  return {
    minX: Math.min(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxX: Math.max(start.x, end.x),
    maxY: Math.max(start.y, end.y),
  }
}

export function selectContentInBounds(documentState: DrawingDocument, bounds: GridSelectionBounds): ContentSelection {
  const strokeIds = documentState.strokes
    .filter((stroke) => stroke.layerId === documentState.activeLayerId && strokeIntersectsBounds(stroke, bounds))
    .map((stroke) => stroke.id)
  const fillIds = documentState.fills
    .filter((fill) => fill.layerId === documentState.activeLayerId && pointInsideBounds({
      x: fill.seed.x / documentState.grid.spacing,
      y: fill.seed.y / documentState.grid.spacing,
    }, bounds))
    .map((fill) => fill.id)
  return { bounds, strokeIds, fillIds }
}

export function copySelectedContent(documentState: DrawingDocument, selection: ContentSelection): SelectionClipboard | null {
  const strokeIds = new Set(selection.strokeIds)
  const fillIds = new Set(selection.fillIds)
  const strokes = documentState.strokes
    .filter((stroke) => strokeIds.has(stroke.id))
    .map(cloneStroke)
  const fills = documentState.fills
    .filter((fill) => fillIds.has(fill.id))
    .map((fill) => ({ ...fill, seed: { ...fill.seed } }))
  if (strokes.length === 0 && fills.length === 0) return null
  return { bounds: { ...selection.bounds }, strokes, fills }
}

export function pasteSelectedContent(
  documentState: DrawingDocument,
  clipboard: SelectionClipboard,
  offset: GridPoint = { x: 1, y: 1 },
): { document: DrawingDocument; selection: ContentSelection } {
  const strokeIds: string[] = []
  const fillIds: string[] = []
  const strokes = clipboard.strokes.map((stroke) => {
    const id = createSelectionId('stroke')
    strokeIds.push(id)
    return {
      ...cloneStroke(stroke),
      id,
      layerId: documentState.activeLayerId,
      points: stroke.points.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })),
    }
  })
  const fills = clipboard.fills.map((fill) => {
    const id = createSelectionId('fill')
    fillIds.push(id)
    return {
      ...fill,
      id,
      layerId: documentState.activeLayerId,
      seed: {
        x: fill.seed.x + offset.x * documentState.grid.spacing,
        y: fill.seed.y + offset.y * documentState.grid.spacing,
      },
    }
  })
  return {
    document: {
      ...documentState,
      strokes: [...documentState.strokes, ...strokes],
      fills: [...documentState.fills, ...fills],
    },
    selection: {
      bounds: translateBounds(clipboard.bounds, offset),
      strokeIds,
      fillIds,
    },
  }
}

export function transformSelectedContent(
  documentState: DrawingDocument,
  selection: ContentSelection,
  transform: SelectionTransform,
): { document: DrawingDocument; selection: ContentSelection } {
  const strokeIds = new Set(selection.strokeIds)
  const fillIds = new Set(selection.fillIds)
  const center = {
    x: (selection.bounds.minX + selection.bounds.maxX) / 2,
    y: (selection.bounds.minY + selection.bounds.maxY) / 2,
  }
  const transformPoint = (point: GridPoint) => transformGridPoint(point, center, transform)
  const strokes = documentState.strokes.map((stroke) => strokeIds.has(stroke.id)
    ? { ...stroke, points: stroke.points.map(transformPoint) }
    : stroke)
  const fills = documentState.fills.map((fill) => {
    if (!fillIds.has(fill.id)) return fill
    const transformed = transformPoint({
      x: fill.seed.x / documentState.grid.spacing,
      y: fill.seed.y / documentState.grid.spacing,
    })
    return {
      ...fill,
      seed: {
        x: transformed.x * documentState.grid.spacing,
        y: transformed.y * documentState.grid.spacing,
      },
    }
  })
  return {
    document: { ...documentState, strokes, fills },
    selection: { ...selection, bounds: transformBounds(selection.bounds, center, transform) },
  }
}

export function translateSelectedContent(
  documentState: DrawingDocument,
  selection: ContentSelection,
  offset: GridPoint,
): { document: DrawingDocument; selection: ContentSelection } {
  if (offset.x === 0 && offset.y === 0) return { document: documentState, selection }
  const strokeIds = new Set(selection.strokeIds)
  const fillIds = new Set(selection.fillIds)
  const strokes = documentState.strokes.map((stroke) => strokeIds.has(stroke.id)
    ? {
        ...stroke,
        points: stroke.points.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })),
      }
    : stroke)
  const fills = documentState.fills.map((fill) => fillIds.has(fill.id)
    ? {
        ...fill,
        seed: {
          x: fill.seed.x + offset.x * documentState.grid.spacing,
          y: fill.seed.y + offset.y * documentState.grid.spacing,
        },
      }
    : fill)
  return {
    document: { ...documentState, strokes, fills },
    selection: { ...selection, bounds: translateBounds(selection.bounds, offset) },
  }
}

export function isGridPointInsideSelection(point: GridPoint, selection: ContentSelection) {
  return pointInsideBounds(point, selection.bounds)
}

function strokeIntersectsBounds(stroke: Stroke, bounds: GridSelectionBounds) {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of stroke.points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return maxX >= bounds.minX && minX <= bounds.maxX && maxY >= bounds.minY && minY <= bounds.maxY
}

function pointInsideBounds(point: GridPoint, bounds: GridSelectionBounds) {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY
}

function transformGridPoint(point: GridPoint, center: GridPoint, transform: SelectionTransform): GridPoint {
  const x = point.x - center.x
  const y = point.y - center.y
  if (transform === 'rotate90') return { x: center.x - y, y: center.y + x }
  if (transform === 'flipHorizontal') return { x: center.x - x, y: point.y }
  return { x: point.x, y: center.y - y }
}

function transformBounds(bounds: GridSelectionBounds, center: GridPoint, transform: SelectionTransform) {
  const corners = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ].map((point) => transformGridPoint(point, center, transform))
  return normalizeSelectionBounds(
    { x: Math.min(...corners.map((point) => point.x)), y: Math.min(...corners.map((point) => point.y)) },
    { x: Math.max(...corners.map((point) => point.x)), y: Math.max(...corners.map((point) => point.y)) },
  )
}

function translateBounds(bounds: GridSelectionBounds, offset: GridPoint): GridSelectionBounds {
  return {
    minX: bounds.minX + offset.x,
    minY: bounds.minY + offset.y,
    maxX: bounds.maxX + offset.x,
    maxY: bounds.maxY + offset.y,
  }
}

function cloneStroke(stroke: Stroke): Stroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
    style: { ...stroke.style },
  }
}

function createSelectionId(prefix: 'stroke' | 'fill') {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
