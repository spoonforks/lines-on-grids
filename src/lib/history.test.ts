import { describe, expect, it } from 'vitest'
import { createHistory, pushHistory, redoHistory, undoHistory } from './history'

describe('history utilities', () => {
  it('tracks draw actions and undo/redo transitions', () => {
    const initial = createHistory({ strokes: 0 })
    const afterFirstDraw = pushHistory(initial, { strokes: 1 })
    const afterSecondDraw = pushHistory(afterFirstDraw, { strokes: 2 })

    expect(afterSecondDraw.past).toEqual([{ strokes: 0 }, { strokes: 1 }])
    expect(undoHistory(afterSecondDraw).present).toEqual({ strokes: 1 })
    expect(redoHistory(undoHistory(afterSecondDraw)).present).toEqual({ strokes: 2 })
  })

  it('clears redo history when a new action is pushed', () => {
    const initial = createHistory({ strokes: 0 })
    const afterDraw = pushHistory(initial, { strokes: 1 })
    const undone = undoHistory(afterDraw)
    const rewritten = pushHistory(undone, { strokes: 5 })

    expect(rewritten.future).toEqual([])
    expect(rewritten.present).toEqual({ strokes: 5 })
  })

  it('supports clear and new-drawing resets', () => {
    const drawingHistory = pushHistory(createHistory({ spacing: 28, strokes: [1, 2] }), {
      spacing: 28,
      strokes: [],
    })
    const freshHistory = createHistory({ spacing: 20, strokes: [] })

    expect(drawingHistory.past).toHaveLength(1)
    expect(drawingHistory.present.strokes).toEqual([])
    expect(freshHistory.past).toEqual([])
    expect(freshHistory.present.spacing).toBe(20)
  })

  it('bounds long-session history to prevent unbounded memory growth', () => {
    let history = createHistory({ strokes: 0 })
    for (let index = 1; index <= 120; index += 1) {
      history = pushHistory(history, { strokes: index })
    }

    expect(history.past).toHaveLength(80)
    expect(history.present.strokes).toBe(120)
  })
})
