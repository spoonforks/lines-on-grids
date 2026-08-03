import { describe, expect, it } from 'vitest'
import { addFill, commitStroke, createDocument } from './document'
import { copySelectedContent, isGridPointInsideSelection, normalizeSelectionBounds, pasteSelectedContent, selectContentInBounds, transformSelectedContent, translateSelectedContent } from './selection'

describe('grid selection', () => {
  const createArtwork = () => addFill(commitStroke(createDocument(20, { width: 600, height: 400 }), {
    points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 3 }],
    style: { color: '#111111', lineWidth: 4 },
    brush: 'auto',
  }), { color: '#3157d5', seed: { x: 40, y: 40 } })

  it('selects active-layer paths and fills within a grid rectangle', () => {
    const documentState = createArtwork()
    const selection = selectContentInBounds(documentState, normalizeSelectionBounds({ x: 0, y: 0 }, { x: 4, y: 4 }))
    expect(selection.strokeIds).toEqual([documentState.strokes[0]?.id])
    expect(selection.fillIds).toEqual([documentState.fills[0]?.id])
  })

  it('copies and pastes editable content with a one-cell offset', () => {
    const documentState = createArtwork()
    const selection = selectContentInBounds(documentState, { minX: 0, minY: 0, maxX: 4, maxY: 4 })
    const clipboard = copySelectedContent(documentState, selection)
    expect(clipboard).not.toBeNull()
    const pasted = pasteSelectedContent(documentState, clipboard!)
    expect(pasted.document.strokes[1]?.points[0]).toEqual({ x: 2, y: 2 })
    expect(pasted.document.fills[1]?.seed).toEqual({ x: 60, y: 60 })
    expect(pasted.selection.bounds).toEqual({ minX: 1, minY: 1, maxX: 5, maxY: 5 })
  })

  it('rotates and flips selected paths and fill seeds around the selection center', () => {
    const documentState = createArtwork()
    const selection = selectContentInBounds(documentState, { minX: 0, minY: 0, maxX: 4, maxY: 4 })
    const rotated = transformSelectedContent(documentState, selection, 'rotate90')
    expect(rotated.document.strokes[0]?.points[0]).toEqual({ x: 3, y: 1 })
    expect(rotated.document.fills[0]?.seed).toEqual({ x: 40, y: 40 })
    const flipped = transformSelectedContent(documentState, selection, 'flipHorizontal')
    expect(flipped.document.strokes[0]?.points[0]).toEqual({ x: 3, y: 1 })
  })

  it('moves selected paths, fill seeds, and bounds by whole grid cells', () => {
    const documentState = createArtwork()
    const selection = selectContentInBounds(documentState, { minX: 0, minY: 0, maxX: 4, maxY: 4 })
    const moved = translateSelectedContent(documentState, selection, { x: 3, y: -2 })
    expect(moved.document.strokes[0]?.points[0]).toEqual({ x: 4, y: -1 })
    expect(moved.document.fills[0]?.seed).toEqual({ x: 100, y: 0 })
    expect(moved.selection.bounds).toEqual({ minX: 3, minY: -2, maxX: 7, maxY: 2 })
    expect(isGridPointInsideSelection({ x: 4, y: 1 }, moved.selection)).toBe(true)
    expect(isGridPointInsideSelection({ x: 2, y: 1 }, moved.selection)).toBe(false)
  })
})
