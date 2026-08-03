import { useEffect, useMemo, useRef, useState } from 'react'
import {
  applyExportMargins,
  expandExportBounds,
  getExportPixelSize,
  getExportPreviewSize,
  renderExportPreview,
} from '../lib/export'
import type { DrawingExportOptions, GridExportBounds } from '../lib/export'
import type { DrawingDocument } from '../types'

interface ExportDialogProps {
  isOpen: boolean
  documentState: DrawingDocument
  artworkBounds: GridExportBounds
  onExportPng: (bounds: GridExportBounds, options: DrawingExportOptions) => void
  onExportSvg: (bounds: GridExportBounds, options: DrawingExportOptions) => void
  onClose: () => void
}

type CropCorner = 'northWest' | 'northEast' | 'southEast' | 'southWest'

const DEFAULT_EXPORT_OPTIONS: DrawingExportOptions = { transparentBackground: false }

export function ExportDialog({ isOpen, documentState, artworkBounds, onExportPng, onExportSvg, onClose }: ExportDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [bounds, setBounds] = useState(() => applyExportMargins(artworkBounds, { top: 1, right: 1, bottom: 1, left: 1 }))
  const [options, setOptions] = useState<DrawingExportOptions>(DEFAULT_EXPORT_OPTIONS)
  const [activeCorner, setActiveCorner] = useState<CropCorner | null>(null)
  const previewBounds = useMemo(() => expandExportBounds(artworkBounds, 7), [artworkBounds])
  const previewSize = getExportPreviewSize(previewBounds)
  const outputSize = getExportPixelSize(documentState, bounds)

  useEffect(() => {
    if (!isOpen) return
    setBounds(applyExportMargins(artworkBounds, { top: 1, right: 1, bottom: 1, left: 1 }))
    setOptions(DEFAULT_EXPORT_OPTIONS)
    setActiveCorner(null)
  }, [artworkBounds, isOpen])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!isOpen || !canvas) return
    renderExportPreview(canvas, documentState, previewBounds, options)
  }, [documentState, isOpen, options, previewBounds])

  if (!isOpen) return null

  const toPreviewPoint = (x: number, y: number) => ({
    x: (x - previewBounds.minX) / (previewBounds.maxX - previewBounds.minX) * previewSize.width,
    y: (y - previewBounds.minY) / (previewBounds.maxY - previewBounds.minY) * previewSize.height,
  })
  const northWest = toPreviewPoint(bounds.minX, bounds.minY)
  const northEast = toPreviewPoint(bounds.maxX, bounds.minY)
  const southEast = toPreviewPoint(bounds.maxX, bounds.maxY)
  const southWest = toPreviewPoint(bounds.minX, bounds.maxY)

  const updateCropFromPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!activeCorner) return
    const rectangle = event.currentTarget.getBoundingClientRect()
    const gridX = Math.round(previewBounds.minX + (event.clientX - rectangle.left) / rectangle.width * (previewBounds.maxX - previewBounds.minX))
    const gridY = Math.round(previewBounds.minY + (event.clientY - rectangle.top) / rectangle.height * (previewBounds.maxY - previewBounds.minY))
    setBounds((current) => {
      const next = { ...current }
      if (activeCorner === 'northWest' || activeCorner === 'southWest') next.minX = clamp(gridX, previewBounds.minX, current.maxX - 1)
      else next.maxX = clamp(gridX, current.minX + 1, previewBounds.maxX)
      if (activeCorner === 'northWest' || activeCorner === 'northEast') next.minY = clamp(gridY, previewBounds.minY, current.maxY - 1)
      else next.maxY = clamp(gridY, current.minY + 1, previewBounds.maxY)
      return next
    })
  }

  const beginCropDrag = (event: React.PointerEvent<SVGCircleElement>, corner: CropCorner) => {
    event.preventDefault()
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId)
    setActiveCorner(corner)
  }

  const finishCropDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setActiveCorner(null)
  }

  const cropPath = `M0 0H${previewSize.width}V${previewSize.height}H0Z M${northWest.x} ${northWest.y}H${northEast.x}V${southEast.y}H${southWest.x}Z`

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card export-dialog visual-export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <div className="export-dialog-heading">
          <div><h2 id="export-title">Export {documentState.name}</h2><p>Drag the four corner handles. The crop always snaps to the drawing grid.</p></div>
          <div className="export-reading"><strong>{outputSize.width} × {outputSize.height}px</strong><span>{bounds.maxX - bounds.minX} × {bounds.maxY - bounds.minY} cells</span></div>
        </div>

        <div className="export-preview-stage" style={{ width: previewSize.width, height: previewSize.height }}>
          <canvas ref={canvasRef} aria-label="Export preview" />
          <svg
            className="export-crop-overlay"
            viewBox={`0 0 ${previewSize.width} ${previewSize.height}`}
            onPointerMove={updateCropFromPointer}
            onPointerUp={finishCropDrag}
            onPointerCancel={finishCropDrag}
          >
            <path className="export-crop-shade" d={cropPath} fillRule="evenodd" />
            <rect className="export-crop-frame" x={northWest.x} y={northWest.y} width={northEast.x - northWest.x} height={southWest.y - northWest.y} />
            {([
              ['northWest', northWest],
              ['northEast', northEast],
              ['southEast', southEast],
              ['southWest', southWest],
            ] as const).map(([corner, point]) => (
              <circle
                key={corner}
                className="export-crop-handle"
                cx={point.x}
                cy={point.y}
                r="7"
                role="button"
                aria-label={`Drag ${corner} export corner`}
                onPointerDown={(event) => beginCropDrag(event, corner)}
              />
            ))}
          </svg>
        </div>

        <div className="export-controls">
          <label className="transparent-export-option">
            <input type="checkbox" checked={options.transparentBackground} onChange={(event) => setOptions({ transparentBackground: event.target.checked })} />
            <span><strong>Transparent background</strong><small>Keep only artwork and layer content</small></span>
          </label>
          <button type="button" onClick={() => setBounds(applyExportMargins(artworkBounds, { top: 1, right: 1, bottom: 1, left: 1 }))}>Reset crop</button>
        </div>

        <div className="dialog-actions export-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={() => onExportSvg(bounds, options)}>Export SVG</button>
          <button type="button" onClick={() => onExportPng(bounds, options)}>Export PNG</button>
        </div>
      </div>
    </div>
  )
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
