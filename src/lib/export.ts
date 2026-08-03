import { serializeDocument } from './document'
import { renderExportedDrawing } from './rendering'
import { getGridMetrics } from './grid'
import type { DrawingDocument } from '../types'

export interface GridExportBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface ExportMargins {
  top: number
  right: number
  bottom: number
  left: number
}

export interface DrawingExportOptions {
  transparentBackground: boolean
}

export function downloadDocumentJson(documentState: DrawingDocument, fileName: string) {
  const blob = new Blob([serializeDocument(documentState)], { type: 'application/json' })
  downloadBlob(blob, fileName)
}

export function downloadDrawingPng(
  documentState: DrawingDocument,
  fileName: string,
  bounds: GridExportBounds,
  options: DrawingExportOptions,
) {
  const canvas = createExportCanvas(documentState, bounds, 2, options)

  canvas.toBlob((blob) => {
    if (!blob) {
      return
    }

    downloadBlob(blob, fileName)
  }, 'image/png')
}

export function downloadDrawingSvg(
  documentState: DrawingDocument,
  fileName: string,
  bounds: GridExportBounds,
  options: DrawingExportOptions,
) {
  const canvas = createExportCanvas(documentState, bounds, 2, options)
  const width = canvas.width / 2
  const height = canvas.height / 2
  const pngDataUrl = canvas.toDataURL('image/png')
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <title>${escapeXml(documentState.name)}</title>`,
    `  <image width="${width}" height="${height}" href="${pngDataUrl}" preserveAspectRatio="none"/>`,
    '</svg>',
  ].join('\n')
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), fileName)
}

export function getArtworkGridBounds(documentState: DrawingDocument): GridExportBounds {
  const visibleLayerIds = new Set(documentState.layers.filter((layer) => layer.visible && layer.opacity > 0).map((layer) => layer.id))
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const stroke of documentState.strokes) {
    if (!visibleLayerIds.has(stroke.layerId)) continue
    const padding = stroke.style.lineWidth / (2 * documentState.grid.spacing)
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x - padding)
      minY = Math.min(minY, point.y - padding)
      maxX = Math.max(maxX, point.x + padding)
      maxY = Math.max(maxY, point.y + padding)
    }
  }

  if (!Number.isFinite(minX)) {
    const halfWidth = Math.max(1, Math.ceil(documentState.canvas.width / documentState.grid.spacing / 2))
    const halfHeight = Math.max(1, Math.ceil(documentState.canvas.height / documentState.grid.spacing / 2))
    return { minX: -halfWidth, minY: -halfHeight, maxX: halfWidth, maxY: halfHeight }
  }

  return {
    minX: Math.floor(minX),
    minY: Math.floor(minY),
    maxX: Math.max(Math.floor(minX) + 1, Math.ceil(maxX)),
    maxY: Math.max(Math.floor(minY) + 1, Math.ceil(maxY)),
  }
}

export function applyExportMargins(bounds: GridExportBounds, margins: ExportMargins): GridExportBounds {
  const minX = bounds.minX - Math.round(margins.left)
  const minY = bounds.minY - Math.round(margins.top)
  return {
    minX,
    minY,
    maxX: Math.max(minX + 1, bounds.maxX + Math.round(margins.right)),
    maxY: Math.max(minY + 1, bounds.maxY + Math.round(margins.bottom)),
  }
}

export function getExportPixelSize(documentState: DrawingDocument, bounds: GridExportBounds) {
  return {
    width: Math.max(1, Math.round((bounds.maxX - bounds.minX) * documentState.grid.spacing)),
    height: Math.max(1, Math.round((bounds.maxY - bounds.minY) * documentState.grid.spacing)),
  }
}

export function getTimestampedFilename(prefix: string, extension: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${prefix}-${timestamp}.${extension}`
}

export function getDocumentFilename(name: string, extension: string) {
  const safeName = name.trim().split('').map((character) => {
    return character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character
  }).join('').replace(/\s+/g, ' ').replace(/[. ]+$/g, '') || 'Untitled grid'
  return `${safeName}.${extension}`
}

export function expandExportBounds(bounds: GridExportBounds, cells: number): GridExportBounds {
  return {
    minX: bounds.minX - cells,
    minY: bounds.minY - cells,
    maxX: bounds.maxX + cells,
    maxY: bounds.maxY + cells,
  }
}

export function getExportPreviewSize(bounds: GridExportBounds, maximumWidth = 760, maximumHeight = 420) {
  const width = Math.max(1, bounds.maxX - bounds.minX)
  const height = Math.max(1, bounds.maxY - bounds.minY)
  const scale = Math.min(maximumWidth / width, maximumHeight / height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function renderExportPreview(
  canvas: HTMLCanvasElement,
  documentState: DrawingDocument,
  bounds: GridExportBounds,
  options: DrawingExportOptions,
) {
  const size = getExportPreviewSize(bounds)
  const pixelRatio = window.devicePixelRatio || 1
  canvas.width = Math.round(size.width * pixelRatio)
  canvas.height = Math.round(size.height * pixelRatio)
  canvas.style.width = `${size.width}px`
  canvas.style.height = `${size.height}px`
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create a 2D canvas context.')
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, size.width, size.height)
  renderDrawingInBounds(context, size, documentState, bounds, options)
  return size
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.click()
  URL.revokeObjectURL(objectUrl)
}

function createExportCanvas(
  documentState: DrawingDocument,
  bounds: GridExportBounds,
  exportScale: number,
  options: DrawingExportOptions,
) {
  const size = getExportPixelSize(documentState, bounds)
  const scaledWidth = size.width * exportScale
  const scaledHeight = size.height * exportScale
  if (scaledWidth > 16_384 || scaledHeight > 16_384 || scaledWidth * scaledHeight > 40_000_000) {
    throw new Error('The selected export crop is too large. Reduce the margins or crop size.')
  }
  const canvas = document.createElement('canvas')
  canvas.width = scaledWidth
  canvas.height = scaledHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create a 2D canvas context.')

  context.setTransform(exportScale, 0, 0, exportScale, 0, 0)
  renderDrawingInBounds(context, size, documentState, bounds, options)
  return canvas
}

function renderDrawingInBounds(
  context: CanvasRenderingContext2D,
  size: { width: number; height: number },
  documentState: DrawingDocument,
  bounds: GridExportBounds,
  options: DrawingExportOptions,
) {
  const spacing = documentState.grid.spacing
  const worldWidth = Math.max(spacing, (bounds.maxX - bounds.minX) * spacing)
  const worldHeight = Math.max(spacing, (bounds.maxY - bounds.minY) * spacing)
  renderExportedDrawing(
    context,
    size,
    getGridMetrics(spacing),
    {
      x: ((bounds.minX + bounds.maxX) / 2) * spacing,
      y: ((bounds.minY + bounds.maxY) / 2) * spacing,
      zoom: Math.min(size.width / worldWidth, size.height / worldHeight),
    },
    documentState,
    options,
  )
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character)
}
