import { describe, expect, it } from 'vitest'
import { commitStroke, createDocument } from './document'
import { applyExportMargins, getArtworkGridBounds, getDocumentFilename, getExportPixelSize } from './export'

describe('export framing', () => {
  it('centers bounds around visible artwork on whole grid cells', () => {
    const documentState = commitStroke(createDocument(20, { width: 1200, height: 800 }), {
      points: [{ x: -2, y: -1 }, { x: 3, y: 4 }],
      style: { color: '#111111', lineWidth: 10 },
      brush: 'auto',
    })

    const bounds = getArtworkGridBounds(documentState)
    expect(bounds).toEqual({ minX: -3, minY: -2, maxX: 4, maxY: 5 })
    expect(getExportPixelSize(documentState, bounds)).toEqual({ width: 140, height: 140 })
  })

  it('applies grid margins and keeps at least one output cell', () => {
    expect(applyExportMargins(
      { minX: -3, minY: -2, maxX: 4, maxY: 5 },
      { top: 2, right: 1, bottom: -2, left: -1 },
    )).toEqual({ minX: -2, minY: -4, maxX: 5, maxY: 3 })

    expect(applyExportMargins(
      { minX: 0, minY: 0, maxX: 2, maxY: 2 },
      { top: -10, right: -10, bottom: -10, left: -10 },
    )).toEqual({ minX: 10, minY: 10, maxX: 11, maxY: 11 })
  })

  it('uses the drawing name for safe export filenames', () => {
    expect(getDocumentFilename('Blue study', 'png')).toBe('Blue study.png')
    expect(getDocumentFilename('A/B: test', 'svg')).toBe('A-B- test.svg')
  })
})
