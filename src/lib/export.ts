import { serializeDocument } from './document'
import { renderExportedDrawing } from './rendering'
import { getGridMetrics } from './grid'
import type { DrawingDocument, ViewportState } from '../types'

export function downloadDocumentJson(documentState: DrawingDocument, fileName: string) {
  const blob = new Blob([serializeDocument(documentState)], { type: 'application/json' })
  downloadBlob(blob, fileName)
}

export function downloadDrawingPng(
  documentState: DrawingDocument,
  fileName: string,
  viewport: ViewportState,
) {
  const canvas = document.createElement('canvas')
  const exportScale = 2
  const { width, height } = documentState.canvas
  canvas.width = width * exportScale
  canvas.height = height * exportScale

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Unable to create a 2D canvas context.')
  }

  context.setTransform(exportScale, 0, 0, exportScale, 0, 0)
  renderExportedDrawing(
    context,
    documentState.canvas,
    getGridMetrics(documentState.grid.spacing),
    viewport,
    documentState,
  )

  canvas.toBlob((blob) => {
    if (!blob) {
      return
    }

    downloadBlob(blob, fileName)
  }, 'image/png')
}

export function getTimestampedFilename(prefix: string, extension: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `${prefix}-${timestamp}.${extension}`
}

function downloadBlob(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.click()
  URL.revokeObjectURL(objectUrl)
}
