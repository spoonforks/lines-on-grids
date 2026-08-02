import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BACKGROUND_COLOR,
  addFill,
  addLayer,
  appendPastedContent,
  commitStroke,
  commitStrokeWithMirrors,
  createDocument,
  exportDocumentPayload,
  removeStroke,
  removeLayer,
  setActiveLayer,
  setBackgroundColor,
  serializeDocument,
  updateLayer,
} from './document'

describe('document utilities', () => {
  it('commits strokes into the drawing document', () => {
    const initial = createDocument(28, { width: 640, height: 480 })
    const updated = commitStroke(initial, {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      style: { color: '#123456', lineWidth: 3 },
      brush: 'auto',
    })

    expect(updated.strokes).toHaveLength(1)
    expect(updated.strokes[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ])
  })

  it('includes fills and active strokes in exports', () => {
    const initial = addFill(createDocument(24, { width: 320, height: 240 }), {
      color: '#abcdef',
      seed: { x: 20, y: 40 },
    })
    const exported = exportDocumentPayload(initial, {
      points: [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
      style: { color: '#ffffff', lineWidth: 2 },
      brush: 'curve',
    })

    expect(exported.fills).toHaveLength(1)
    expect(exported.strokes[0]?.id).toBe('active-stroke')
  })

  it('commits mirrored paths together as one document update', () => {
    const initial = createDocument(28, { width: 640, height: 480 })
    const updated = commitStrokeWithMirrors(initial, {
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
      style: { color: '#111111', lineWidth: 4 },
      brush: 'auto',
    }, true, true)

    expect(updated.strokes).toHaveLength(4)
    expect(updated.strokes.map((stroke) => stroke.points[0])).toEqual([
      { x: 1, y: 2 },
      { x: -1, y: 2 },
      { x: 1, y: -2 },
      { x: -1, y: -2 },
    ])
  })

  it('updates the document background color', () => {
    const initial = createDocument(24, { width: 320, height: 240 })
    const updated = setBackgroundColor(initial, '#123456')

    expect(updated.backgroundColor).toBe('#123456')
  })

  it('stores pattern fills as editable document content', () => {
    const updated = addFill(createDocument(24, { width: 320, height: 240 }), {
      color: '#111111',
      seed: { x: 10, y: 20 },
      pattern: 'crosshatch',
      extendsToCanvasEdge: true,
    })

    expect(updated.fills[0]).toMatchObject({
      layerId: 'layer-1',
      color: '#111111',
      pattern: 'crosshatch',
      extendsToCanvasEdge: true,
    })
  })

  it('removes erased strokes and appends pasted content', () => {
    const withStroke = commitStroke(createDocument(24, { width: 320, height: 240 }), {
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 2 },
      ],
      style: { color: '#ffffff', lineWidth: 2 },
      brush: 'auto',
    })
    const removed = removeStroke(withStroke, withStroke.strokes[0]?.id ?? '')

    expect(removed.strokes).toEqual([])

    const pasted = appendPastedContent(removed, {
      strokes: withStroke.strokes,
      fills: [
        {
          id: 'fill-1',
          color: '#123456',
          seed: { x: 12, y: 18 },
        },
      ],
    })

    expect(pasted.strokes).toHaveLength(1)
    expect(pasted.fills).toHaveLength(1)
  })

  it('serializes versioned document data with fill metadata', () => {
    const initial = addFill(createDocument(30, { width: 800, height: 600 }), {
      color: '#fedcba',
      seed: { x: 40, y: 60 },
    })
    const serialized = serializeDocument(initial)
    const parsed = JSON.parse(serialized)

    expect(parsed.version).toBe(5)
    expect(parsed.grid).toEqual({ spacing: 30 })
    expect(parsed.canvas).toEqual({ width: 800, height: 600 })
    expect(parsed.backgroundColor).toBe(DEFAULT_BACKGROUND_COLOR)
    expect(parsed.layers).toEqual([
      { id: 'layer-1', name: 'Layer 1', visible: true, locked: false, opacity: 1 },
    ])
    expect(parsed.fills).toEqual([
      {
        id: parsed.fills[0].id,
        layerId: 'layer-1',
        color: '#fedcba',
        seed: { x: 40, y: 60 },
      },
    ])
  })

  it('manages active, locked, hidden, and removable layers', () => {
    const initial = createDocument(28, { width: 640, height: 480 })
    const withLayer = addLayer(initial, 'Ink')
    const ink = withLayer.layers[1]
    const configured = updateLayer(withLayer, ink.id, { opacity: 0.45, locked: true, visible: false })

    expect(configured.activeLayerId).toBe(ink.id)
    expect(configured.layers[1]).toMatchObject({ name: 'Ink', opacity: 0.45, locked: true, visible: false })
    expect(setActiveLayer(configured, 'layer-1').activeLayerId).toBe('layer-1')
    expect(removeLayer(configured, ink.id).layers).toHaveLength(1)
  })
})
