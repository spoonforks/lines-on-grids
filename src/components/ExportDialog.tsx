import { useEffect, useMemo, useState } from 'react'
import { applyExportMargins, getExportPixelSize } from '../lib/export'
import type { ExportMargins, GridExportBounds } from '../lib/export'
import type { DrawingDocument } from '../types'

interface ExportDialogProps {
  isOpen: boolean
  documentState: DrawingDocument
  artworkBounds: GridExportBounds
  onExportPng: (bounds: GridExportBounds) => void
  onExportSvg: (bounds: GridExportBounds) => void
  onClose: () => void
}

const DEFAULT_MARGINS: ExportMargins = { top: 1, right: 1, bottom: 1, left: 1 }

export function ExportDialog({ isOpen, documentState, artworkBounds, onExportPng, onExportSvg, onClose }: ExportDialogProps) {
  const [margins, setMargins] = useState<ExportMargins>(DEFAULT_MARGINS)

  useEffect(() => {
    if (isOpen) setMargins(DEFAULT_MARGINS)
  }, [isOpen, artworkBounds])

  const bounds = useMemo(() => applyExportMargins(artworkBounds, margins), [artworkBounds, margins])
  const size = getExportPixelSize(documentState, bounds)
  if (!isOpen) return null

  const updateMargin = (side: keyof ExportMargins, value: number) => {
    const next = Number.isFinite(value) ? Math.min(100, Math.max(-100, Math.round(value))) : 0
    setMargins((current) => ({ ...current, [side]: next }))
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
        <h2 id="export-title">Export artwork</h2>
        <p>The artwork is centered automatically. Adjust each edge in whole grid cells; negative values crop into the artwork.</p>
        <div className="export-reading"><strong>{size.width} × {size.height}px</strong><span>{bounds.maxX - bounds.minX} × {bounds.maxY - bounds.minY} grid cells</span></div>
        <fieldset className="crop-fields">
          <legend>Grid crop margins</legend>
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <label key={side}><span>{side[0].toUpperCase() + side.slice(1)}</span><input aria-label={`${side} export margin`} type="number" min="-100" max="100" value={margins[side]} onChange={(event) => updateMargin(side, Number(event.target.value))} /><small>cells</small></label>
          ))}
        </fieldset>
        <div className="dialog-actions export-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={() => onExportSvg(bounds)}>Export SVG</button>
          <button type="button" onClick={() => onExportPng(bounds)}>Export PNG</button>
        </div>
      </div>
    </div>
  )
}
