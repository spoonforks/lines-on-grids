import { useEffect, useState } from 'react'

interface NewDrawingDialogProps {
  isOpen: boolean
  spacing: number
  minSpacing: number
  maxSpacing: number
  onSpacingChange: (spacing: number) => void
  onConfirm: (spacing: number) => void
  onClose: () => void
  isFirstRun: boolean
}

export function NewDrawingDialog({
  isOpen,
  spacing,
  minSpacing,
  maxSpacing,
  onSpacingChange,
  onConfirm,
  onClose,
  isFirstRun,
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
      <div className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="new-drawing-title">
        <h2 id="new-drawing-title">
          {isFirstRun ? 'Set up your first drawing' : 'Start a new drawing'}
        </h2>
        <p>Choose the dot spacing before the canvas resets. Smaller spacing creates a denser grid.</p>

        <div className="dialog-field">
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

        <div className="dialog-actions">
          {!isFirstRun ? (
            <button type="button" onClick={onClose}>
              Cancel
            </button>
          ) : null}
          <button type="button" onClick={() => onConfirm(spacing)}>
            {isFirstRun ? 'Create canvas' : 'Start fresh'}
          </button>
        </div>
      </div>
    </div>
  )
}
