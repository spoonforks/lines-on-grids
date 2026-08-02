import type { CanvasSize, DrawingDocument, DrawingLayer, FillRegion, StrokeDraft } from '../types'
import { getMirroredPointSets } from './grid'

const DOCUMENT_VERSION = 5 as const
const INITIAL_LAYER_ID = 'layer-1'
export const DEFAULT_BACKGROUND_COLOR = '#ffffff'

export function createDocument(spacing: number, canvas: CanvasSize): DrawingDocument {
  return {
    version: DOCUMENT_VERSION,
    grid: {
      spacing: Math.round(spacing),
    },
    canvas: { ...canvas },
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
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

function createLayer(id: string, name: string): DrawingLayer {
  return { id, name, visible: true, locked: false, opacity: 1 }
}

function createId(prefix: 'stroke' | 'fill' | 'layer') {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}
