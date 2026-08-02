import type { HistoryState } from '../types'

const MAX_HISTORY_ENTRIES = 80

export function createHistory<T>(initialState: T): HistoryState<T> {
  return {
    past: [],
    present: initialState,
    future: [],
  }
}

export function pushHistory<T>(historyState: HistoryState<T>, nextState: T): HistoryState<T> {
  if (historyState.present === nextState) {
    return historyState
  }

  return {
    past: [...historyState.past, historyState.present].slice(-MAX_HISTORY_ENTRIES),
    present: nextState,
    future: [],
  }
}

export function undoHistory<T>(historyState: HistoryState<T>): HistoryState<T> {
  const previousState = historyState.past.at(-1)

  if (!previousState) {
    return historyState
  }

  return {
    past: historyState.past.slice(0, -1),
    present: previousState,
    future: [historyState.present, ...historyState.future],
  }
}

export function redoHistory<T>(historyState: HistoryState<T>): HistoryState<T> {
  const nextState = historyState.future[0]

  if (!nextState) {
    return historyState
  }

  return {
    past: [...historyState.past, historyState.present].slice(-MAX_HISTORY_ENTRIES),
    present: nextState,
    future: historyState.future.slice(1),
  }
}
