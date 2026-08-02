import { useEffect, useState } from 'react'

interface NewDrawingDialogProps {
  isOpen: boolean
  spacing: number
  minSpacing: number
  maxSpacing: number
  onSpacingChange: (spacing: number) => void
  onConfirm: (spacing: number) => void
  onClose: () => void
  onImport: (file: File) => void
  isStartup: boolean
  canContinue: boolean
  error?: string | null
}

export function NewDrawingDialog({
  isOpen,
  spacing,
  minSpacing,
  maxSpacing,
  onSpacingChange,
  onConfirm,
  onClose,
  onImport,
  isStartup,
  canContinue,
  error,
}: NewDrawingDialogProps) {
  const [numericValue, setNumericValue] = useState(String(spacing))

  useEffect(() => {
    setNumericValue(String(spacing))
  }, [spacing])

  if (!isOpen) {
    return null
  }

  const applySpacing = (value: number) => {
    if (Number.isNaN(value)) {
      setNumericValue(String(spacing))
      return
    }

    const clampedValue = Math.min(maxSpacing, Math.max(minSpacing, Math.round(value)))
    onSpacingChange(clampedValue)
    setNumericValue(String(clampedValue))
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card start-dialog" role="dialog" aria-modal="true" aria-labelledby="new-drawing-title">
        <h2 id="new-drawing-title">
          {isStartup ? 'Start drawing' : 'Start a new drawing'}
        </h2>
        <p>{isStartup ? 'Continue your autosaved work, create a new grid, or open a JSON drawing.' : 'Choose the dot spacing before the canvas resets.'}</p>
        {error ? <p className="dialog-error" role="alert">{error}</p> : null}

        {isStartup && canContinue ? (
          <button type="button" className="start-choice continue-choice" onClick={onClose}>
            <strong>Continue autosaved drawing</strong>
            <span>Resume exactly where you left off</span>
          </button>
        ) : null}

        <div className="dialog-field new-document-field">
          <strong>New drawing</strong>
          <label htmlFor="grid-spacing-range">
            <span>Grid spacing</span>
            <strong>{spacing}px</strong>
          </label>

          <input
            id="grid-spacing-range"
            type="range"
            min={minSpacing}
            max={maxSpacing}
            value={spacing}
            onChange={(event) => applySpacing(Number(event.target.value))}
          />

          <div className="dialog-reading">
            <span>Exact value</span>
            <span>
              {minSpacing}px to {maxSpacing}px
            </span>
          </div>

          <input
            type="number"
            min={minSpacing}
            max={maxSpacing}
            value={numericValue}
            onChange={(event) => setNumericValue(event.target.value)}
            onBlur={() => applySpacing(Number(numericValue))}
          />
        </div>

        <label className="start-choice import-choice">
          <input type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onImport(file)
            event.currentTarget.value = ''
          }} />
          <strong>Import JSON</strong>
          <span>Open a Lines on Grids backup</span>
        </label>

        <div className="dialog-actions">
          {!isStartup ? (
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          ) : null}
          <button type="button" onClick={() => onConfirm(spacing)}>
            Create new drawing
          </button>
        </div>
      </div>
    </div>
  )
}
