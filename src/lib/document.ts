import type { CanvasSize, DrawingDocument, DrawingLayer, FillRegion, StrokeDraft } from '../types'
import { getMirroredPointSets } from './grid'
import { normalizeHexColor } from './color'

const DOCUMENT_VERSION = 5 as const
const INITIAL_LAYER_ID = 'layer-1'
export const DEFAULT_BACKGROUND_COLOR = '#ffffff'

export function createDocument(spacing: number, canvas: CanvasSize, backgroundColor = DEFAULT_BACKGROUND_COLOR): DrawingDocument {
  return {
    version: DOCUMENT_VERSION,
    grid: {
      spacing: Math.round(spacing),
    },
    canvas: { ...canvas },
    backgroundColor: normalizeHexColor(backgroundColor) ?? DEFAULT_BACKGROUND_COLOR,
    layers: [createLayer(INITIAL_LAYER_ID, 'Layer 1')],
    activeLayerId: INITIAL_LAYER_ID,
    strokes: [],
    fills: [],
  }
}

export function syncDocumentCanvas(documentState: DrawingDocument, canvas: CanvasSize): DrawingDocument {
  if (
    documentState.canvas.width === canvas.width &&
    documentState.canvas.height === canvas.height
  ) {
    return documentState
  }

  return {
    ...documentState,
    canvas,
  }
}

export function commitStroke(
  documentState: DrawingDocument,
  strokeDraft: StrokeDraft,
): DrawingDocument {
  if (strokeDraft.points.length < 2) {
    return documentState
  }

  return {
    ...documentState,
    strokes: [
      ...documentState.strokes,
      {
        id: createId('stroke'),
        layerId: documentState.activeLayerId,
        points: [...strokeDraft.points],
        style: { ...strokeDraft.style },
        brush: strokeDraft.brush,
      },
    ],
  }
}

export function commitStrokeWithMirrors(
  documentState: DrawingDocument,
  strokeDraft: StrokeDraft,
  mirrorX: boolean,
  mirrorY: boolean,
): DrawingDocument {
  if (strokeDraft.points.length < 2) return documentState

  const pointSets = getMirroredPointSets(strokeDraft.points, mirrorX, mirrorY)
  return {
    ...documentState,
    strokes: [
      ...documentState.strokes,
      ...pointSets.map((points) => ({
        id: createId('stroke'),
        layerId: documentState.activeLayerId,
        points,
        style: { ...strokeDraft.style },
        brush: strokeDraft.brush,
      })),
    ],
  }
}

export function addFill(documentState: DrawingDocument, fill: Omit<FillRegion, 'id' | 'layerId'>): DrawingDocument {
  return {
    ...documentState,
    fills: [
      ...documentState.fills,
      {
        id: createId('fill'),
        layerId: documentState.activeLayerId,
        color: fill.color,
        seed: { ...fill.seed },
        pattern: fill.pattern,
        extendsToCanvasEdge: fill.extendsToCanvasEdge,
      },
    ],
  }
}

export function addFillWithMirrors(
  documentState: DrawingDocument,
  fill: Omit<FillRegion, 'id' | 'layerId'>,
  mirrorX: boolean,
  mirrorY: boolean,
): DrawingDocument {
  const seeds = getMirroredWorldPoints(fill.seed, mirrorX, mirrorY)
  return {
    ...documentState,
    fills: [
      ...documentState.fills,
      ...seeds.map((seed) => ({
        id: createId('fill'),
        layerId: documentState.activeLayerId,
        color: fill.color,
        seed,
        pattern: fill.pattern,
        extendsToCanvasEdge: fill.extendsToCanvasEdge,
      })),
    ],
  }
}

export function setBackgroundColor(
  documentState: DrawingDocument,
  backgroundColor: string,
): DrawingDocument {
  if (documentState.backgroundColor === backgroundColor) {
    return documentState
  }

  return {
    ...documentState,
    backgroundColor,
  }
}

export function exportDocumentPayload(
  documentState: DrawingDocument,
  activeStroke: StrokeDraft | null,
  mirrorX = false,
  mirrorY = false,
): DrawingDocument {
  if (!activeStroke || activeStroke.points.length < 2) {
    return documentState
  }

  return {
    ...documentState,
    strokes: [
      ...documentState.strokes,
      ...getMirroredPointSets(activeStroke.points, mirrorX, mirrorY).map((points, index) => ({
        id: index === 0 ? 'active-stroke' : `active-stroke-mirror-${index}`,
        layerId: documentState.activeLayerId,
        points,
        style: { ...activeStroke.style },
        brush: activeStroke.brush,
      })),
    ],
  }
}

export function removeStroke(documentState: DrawingDocument, strokeId: string): DrawingDocument {
  return {
    ...documentState,
    strokes: documentState.strokes.filter((stroke) => stroke.id !== strokeId),
  }
}

export function addLayer(documentState: DrawingDocument, name?: string): DrawingDocument {
  const layer = createLayer(createId('layer'), name ?? `Layer ${documentState.layers.length + 1}`)

  return {
    ...documentState,
    layers: [...documentState.layers, layer],
    activeLayerId: layer.id,
  }
}

export function duplicateLayer(documentState: DrawingDocument, layerId: string): DrawingDocument {
  const sourceIndex = documentState.layers.findIndex((layer) => layer.id === layerId)
  const source = documentState.layers[sourceIndex]

  if (!source) {
    return documentState
  }

  const duplicate = createLayer(createId('layer'), `${source.name} copy`)
  duplicate.opacity = source.opacity
  duplicate.visible = source.visible
  const nextLayers = [...documentState.layers]
  nextLayers.splice(sourceIndex + 1, 0, duplicate)

  return {
    ...documentState,
    layers: nextLayers,
    activeLayerId: duplicate.id,
    strokes: [
      ...documentState.strokes,
      ...documentState.strokes
        .filter((stroke) => stroke.layerId === layerId)
        .map((stroke) => ({
          ...stroke,
          id: createId('stroke'),
          layerId: duplicate.id,
          points: stroke.points.map((point) => ({ ...point })),
          style: { ...stroke.style },
        })),
    ],
    fills: [
      ...documentState.fills,
      ...documentState.fills
        .filter((fill) => fill.layerId === layerId)
        .map((fill) => ({ ...fill, id: createId('fill'), layerId: duplicate.id, seed: { ...fill.seed } })),
    ],
  }
}

export function removeLayer(documentState: DrawingDocument, layerId: string): DrawingDocument {
  if (documentState.layers.length <= 1) {
    return documentState
  }

  const layerIndex = documentState.layers.findIndex((layer) => layer.id === layerId)

  if (layerIndex < 0) {
    return documentState
  }

  const layers = documentState.layers.filter((layer) => layer.id !== layerId)
  const nextActiveLayer = layers[Math.max(0, layerIndex - 1)] ?? layers[0]

  return {
    ...documentState,
    layers,
    activeLayerId: documentState.activeLayerId === layerId ? nextActiveLayer.id : documentState.activeLayerId,
    strokes: documentState.strokes.filter((stroke) => stroke.layerId !== layerId),
    fills: documentState.fills.filter((fill) => fill.layerId !== layerId),
  }
}

export function updateLayer(
  documentState: DrawingDocument,
  layerId: string,
  update: Partial<Pick<DrawingLayer, 'name' | 'visible' | 'locked' | 'opacity'>>,
): DrawingDocument {
  let changed = false
  const layers = documentState.layers.map((layer) => {
    if (layer.id !== layerId) {
      return layer
    }

    changed = true
    return {
      ...layer,
      ...update,
      name: update.name?.trim() || layer.name,
      opacity: update.opacity === undefined ? layer.opacity : Math.max(0, Math.min(1, update.opacity)),
    }
  })

  return changed ? { ...documentState, layers } : documentState
}

export function setActiveLayer(documentState: DrawingDocument, layerId: string): DrawingDocument {
  if (documentState.activeLayerId === layerId || !documentState.layers.some((layer) => layer.id === layerId)) {
    return documentState
  }

  return { ...documentState, activeLayerId: layerId }
}

export function moveLayer(documentState: DrawingDocument, layerId: string, direction: -1 | 1) {
  const index = documentState.layers.findIndex((layer) => layer.id === layerId)
  const targetIndex = index + direction

  if (index < 0 || targetIndex < 0 || targetIndex >= documentState.layers.length) {
    return documentState
  }

  const layers = [...documentState.layers]
  ;[layers[index], layers[targetIndex]] = [layers[targetIndex], layers[index]]
  return { ...documentState, layers }
}

export function clearActiveLayer(documentState: DrawingDocument) {
  const activeLayerId = documentState.activeLayerId
  return {
    ...documentState,
    strokes: documentState.strokes.filter((stroke) => stroke.layerId !== activeLayerId),
    fills: documentState.fills.filter((fill) => fill.layerId !== activeLayerId),
  }
}

export function appendPastedContent(
  documentState: DrawingDocument,
  content: {
    strokes: DrawingDocument['strokes']
    fills: Array<Omit<FillRegion, 'layerId'> & { layerId?: string }>
  },
): DrawingDocument {
  return {
    ...documentState,
    strokes: [
      ...documentState.strokes,
      ...content.strokes.map((stroke) => ({
        ...stroke,
        id: createId('stroke'),
        layerId: documentState.activeLayerId,
        points: stroke.points.map((point) => ({ ...point })),
        style: { ...stroke.style },
      })),
    ],
    fills: [
      ...documentState.fills,
      ...content.fills.map((fill) => ({
        id: createId('fill'),
        layerId: documentState.activeLayerId,
        color: fill.color,
        seed: { ...fill.seed },
        pattern: fill.pattern,
        extendsToCanvasEdge: fill.extendsToCanvasEdge,
      })),
    ],
  }
}

export function serializeDocument(documentState: DrawingDocument): string {
  return JSON.stringify(documentState, null, 2)
}

export function parseDocumentJson(json: string): DrawingDocument {
  const parsed = JSON.parse(json) as unknown
  const candidate = isRecord(parsed) && 'document' in parsed ? parsed.document : parsed
  if (!isRecord(candidate) || candidate.version !== DOCUMENT_VERSION) throw new Error('This is not a supported Lines on Grids document.')
  if (!isRecord(candidate.grid) || !Number.isFinite(candidate.grid.spacing)) throw new Error('The document has an invalid grid size.')
  if (!isRecord(candidate.canvas) || !Number.isFinite(candidate.canvas.width) || !Number.isFinite(candidate.canvas.height)) throw new Error('The document has an invalid canvas size.')
  if (!Array.isArray(candidate.layers) || candidate.layers.length === 0) throw new Error('The document does not contain any layers.')

  const layers = candidate.layers.map((layer, index) => {
    if (!isRecord(layer) || typeof layer.id !== 'string' || !layer.id) throw new Error(`Layer ${index + 1} is invalid.`)
    return {
      id: layer.id,
      name: typeof layer.name === 'string' && layer.name.trim() ? layer.name.trim() : `Layer ${index + 1}`,
      visible: layer.visible !== false,
      locked: layer.locked === true,
      opacity: clampNumber(layer.opacity, 0, 1, 1),
    }
  })
  const layerIds = new Set(layers.map((layer) => layer.id))
  if (layerIds.size !== layers.length) throw new Error('The document contains duplicate layer IDs.')

  const rawStrokes = Array.isArray(candidate.strokes) ? candidate.strokes : []
  const strokes = rawStrokes.map((stroke, index) => {
    if (!isRecord(stroke) || typeof stroke.id !== 'string' || typeof stroke.layerId !== 'string' || !layerIds.has(stroke.layerId)) throw new Error(`Path ${index + 1} references an invalid layer.`)
    if (!Array.isArray(stroke.points) || stroke.points.length < 2) throw new Error(`Path ${index + 1} does not contain enough points.`)
    const points = stroke.points.map((point) => {
      if (!isRecord(point) || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error(`Path ${index + 1} contains an invalid point.`)
      return { x: Number(point.x), y: Number(point.y) }
    })
    if (!isRecord(stroke.style)) throw new Error(`Path ${index + 1} has an invalid style.`)
    const color = typeof stroke.style.color === 'string' ? normalizeHexColor(stroke.style.color) : null
    if (!color || !Number.isFinite(stroke.style.lineWidth)) throw new Error(`Path ${index + 1} has an invalid style.`)
    return {
      id: stroke.id,
      layerId: stroke.layerId,
      points,
      style: { color, lineWidth: clampNumber(stroke.style.lineWidth, 1, 1000, 1) },
      brush: stroke.brush === 'curve' ? 'curve' as const : 'auto' as const,
    }
  })

  const validPatterns = new Set(['bayer25', 'bayer50', 'bayer75', 'diagonal', 'crosshatch', 'stipple'])
  const rawFills = Array.isArray(candidate.fills) ? candidate.fills : []
  const fills = rawFills.map((fill, index) => {
    if (!isRecord(fill) || typeof fill.id !== 'string' || typeof fill.layerId !== 'string' || !layerIds.has(fill.layerId)) throw new Error(`Fill ${index + 1} references an invalid layer.`)
    if (!isRecord(fill.seed) || !Number.isFinite(fill.seed.x) || !Number.isFinite(fill.seed.y)) throw new Error(`Fill ${index + 1} has an invalid seed point.`)
    const color = typeof fill.color === 'string' ? normalizeHexColor(fill.color) : null
    if (!color) throw new Error(`Fill ${index + 1} has an invalid color.`)
    return {
      id: fill.id,
      layerId: fill.layerId,
      color,
      seed: { x: Number(fill.seed.x), y: Number(fill.seed.y) },
      pattern: typeof fill.pattern === 'string' && validPatterns.has(fill.pattern) ? fill.pattern as FillRegion['pattern'] : undefined,
      extendsToCanvasEdge: fill.extendsToCanvasEdge === true || undefined,
    }
  })

  const activeLayerId = typeof candidate.activeLayerId === 'string' && layerIds.has(candidate.activeLayerId)
    ? candidate.activeLayerId
    : layers[0].id
  return {
    version: DOCUMENT_VERSION,
    grid: { spacing: clampNumber(candidate.grid.spacing, 8, 256, 28) },
    canvas: {
      width: clampNumber(candidate.canvas.width, 1, 100_000, 1200),
      height: clampNumber(candidate.canvas.height, 1, 100_000, 800),
    },
    backgroundColor: typeof candidate.backgroundColor === 'string'
      ? normalizeHexColor(candidate.backgroundColor) ?? DEFAULT_BACKGROUND_COLOR
      : DEFAULT_BACKGROUND_COLOR,
    layers,
    activeLayerId,
    strokes,
    fills,
  }
}

function createLayer(id: string, name: string): DrawingLayer {
  return { id, name, visible: true, locked: false, opacity: 1 }
}

function getMirroredWorldPoints(point: { x: number; y: number }, mirrorX: boolean, mirrorY: boolean) {
  const points = [{ ...point }]
  if (mirrorX) points.push({ x: -point.x, y: point.y })
  if (mirrorY) points.push({ x: point.x, y: -point.y })
  if (mirrorX && mirrorY) points.push({ x: -point.x, y: -point.y })
  return points.filter((candidate, index) => points.findIndex((item) => item.x === candidate.x && item.y === candidate.y) === index)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback
}

function createId(prefix: 'stroke' | 'fill' | 'layer') {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}
