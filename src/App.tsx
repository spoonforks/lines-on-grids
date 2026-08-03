import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import './App.css'
import { ColorWheel } from './components/ColorWheel'
import { ExportDialog } from './components/ExportDialog'
import { NewDrawingDialog } from './components/NewDrawingDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { normalizeHexColor } from './lib/color'
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_DOCUMENT_NAME,
  addFill,
  addFillWithMirrors,
  addLayer,
  clearActiveLayer,
  commitStrokeWithMirrors,
  createDocument,
  duplicateLayer,
  exportDocumentPayload,
  moveLayer,
  parseDocumentJson,
  removeLayer,
  setActiveLayer,
  setBackgroundColor,
  syncDocumentCanvas,
  updateLayer,
} from './lib/document'
import {
  downloadDocumentJson,
  downloadDrawingPng,
  downloadDrawingSvg,
  getArtworkGridBounds,
  getDocumentFilename,
} from './lib/export'
import type { DrawingExportOptions, GridExportBounds } from './lib/export'
import {
  appendSegmentPoints,
  getGridMetrics,
  gridPointToWorldPoint,
  screenPointToWorldPoint,
  snapScreenPointToGrid,
} from './lib/grid'
import { createHistory, pushHistory, redoHistory, undoHistory } from './lib/history'
import { loadRecoverySnapshot, saveRecoverySnapshot } from './lib/persistence'
import type { RecoverySnapshot } from './lib/persistence'
import { loadPreferences, savePreferences } from './lib/preferences'
import { createShapePoints, MAX_SHAPE_SIZE, MIN_SHAPE_SIZE, normalizeShapeSize, SHAPE_SIZE_STEP } from './lib/shapes'
import {
  copySelectedContent,
  normalizeSelectionBounds,
  pasteSelectedContent,
  selectContentInBounds,
  transformSelectedContent,
} from './lib/selection'
import type { ContentSelection, SelectionClipboard, SelectionTransform } from './lib/selection'
import {
  configureCanvas,
  drawActiveStrokeLayer,
  drawDrawingSurface,
  drawGridLayer,
  drawOverlay,
  findStrokeAtCanvasPoint,
  resolveBucketActionAtCanvasPoint,
  sampleSceneColorAtCanvasPoint,
} from './lib/rendering'
import type {
  BrushMode,
  CanvasSize,
  DitherPattern,
  DrawingDocument,
  GridPoint,
  ShapeMode,
  Stroke,
  StrokeDraft,
  ToolMode,
  ToolState,
  ViewportState,
  WorldPoint,
} from './types'

const DEFAULT_CANVAS_SIZE: CanvasSize = { width: 1200, height: 800 }
const DEFAULT_GRID_SPACING = 28
const COLOR_SWATCHES = ['#111111', '#ffffff', '#3157d5', '#e24a3b', '#e2a72e', '#278761', '#7b4bc4', '#ef7fba']
const MIN_GRID_SPACING = 12
const MAX_GRID_SPACING = 64
const MIN_LINE_WIDTH = 1
const MAX_LINE_WIDTH = 100
const MAX_ACTIVE_STROKE_POINTS = 12_000
const RECOVERY_SAVE_INTERVAL_MS = 2_000
const MIN_ZOOM = 0.15
const MAX_ZOOM = 8
const STORAGE_KEY = 'lines-on-grids-document-v5'

function App() {
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const activeCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const finishActivePathRef = useRef<() => void>(() => undefined)
  const undoLatestActionRef = useRef<() => void>(() => undefined)
  const redoLatestActionRef = useRef<() => void>(() => undefined)
  const previewDocumentRef = useRef<DrawingDocument | null>(null)
  const eraseSessionRef = useRef<{ pointerId: number } | null>(null)
  const selectionSessionRef = useRef<{ pointerId: number; start: GridPoint; end: GridPoint } | null>(null)
  const panStateRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    viewport: ViewportState
  } | null>(null)
  const initialSavedAtRef = useRef(0)
  const initialSnapshotRef = useRef<RecoverySnapshot | null>(null)
  const lastRecoverySaveRef = useRef(0)
  const [canvasSize, setCanvasSize] = useState(DEFAULT_CANVAS_SIZE)
  const [viewport, setViewport] = useState<ViewportState>({ x: 0, y: 0, zoom: 1 })
  const [history, setHistory] = useState(() => {
    const snapshot = loadLocalSnapshot()
    initialSavedAtRef.current = snapshot.savedAt
    lastRecoverySaveRef.current = snapshot.savedAt
    initialSnapshotRef.current = snapshot
    return createHistory(snapshot.document)
  })
  const [previewDocument, setPreviewDocument] = useState<DrawingDocument | null>(null)
  const [toolState, setToolState] = useState<ToolState>({
    selectedTool: initialSnapshotRef.current?.selectedTool ?? 'draw',
    color: '#111111',
    lineWidth: 4,
    pattern: 'bayer50',
    shape: 'square',
    shapeSize: 4,
    mirrorX: initialSnapshotRef.current?.mirrorX ?? false,
    mirrorY: initialSnapshotRef.current?.mirrorY ?? false,
    activeStroke: initialSnapshotRef.current?.activeStroke ?? null,
    hoverPoint: null,
    hoveredStrokeId: null,
  })
  const [isDialogOpen, setIsDialogOpen] = useState(true)
  const [isStartupDialog, setIsStartupDialog] = useState(true)
  const [importError, setImportError] = useState<string | null>(null)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [preferences, setPreferences] = useState(loadPreferences)
  const [hasRecovery, setHasRecovery] = useState(initialSavedAtRef.current > 0)
  const [draftSpacing, setDraftSpacing] = useState(DEFAULT_GRID_SPACING)
  const [draftName, setDraftName] = useState(DEFAULT_DOCUMENT_NAME)
  const [selection, setSelection] = useState<ContentSelection | null>(null)
  const [selectionClipboard, setSelectionClipboard] = useState<SelectionClipboard | null>(null)
  const [isAltPressed, setIsAltPressed] = useState(false)
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [showGridDots, setShowGridDots] = useState(true)
  const [pickerPoint, setPickerPoint] = useState<WorldPoint | null>(null)
  const [notice, setNotice] = useState('Ready')
  const [isPersistenceReady, setIsPersistenceReady] = useState(false)
  const [saveState, setSaveState] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading')

  const persistedDocument = useMemo(() => syncDocumentCanvas(history.present, canvasSize), [history.present, canvasSize])
  const documentState = previewDocument ?? persistedDocument
  const exportableDocument = useMemo(
    () => exportDocumentPayload(persistedDocument, toolState.activeStroke, toolState.mirrorX, toolState.mirrorY),
    [persistedDocument, toolState.activeStroke, toolState.mirrorX, toolState.mirrorY],
  )
  const artworkBounds = useMemo(() => getArtworkGridBounds(exportableDocument), [exportableDocument])
  const gridMetrics = useMemo(() => getGridMetrics(documentState.grid.spacing), [documentState.grid.spacing])
  const activeLayer = documentState.layers.find((layer) => layer.id === documentState.activeLayerId) ?? documentState.layers[0]
  const activeLayerStrokes = useMemo(
    () => documentState.strokes.filter((stroke) => stroke.layerId === activeLayer?.id),
    [documentState.strokes, activeLayer?.id],
  )
  const visibleStrokes = useMemo(() => {
    const visibleLayerIds = new Set(documentState.layers.filter((layer) => layer.visible && layer.opacity > 0).map((layer) => layer.id))
    return documentState.strokes.filter((stroke) => visibleLayerIds.has(stroke.layerId))
  }, [documentState.layers, documentState.strokes])
  const hoveredStroke = visibleStrokes.find((stroke) => stroke.id === toolState.hoveredStrokeId) ?? null
  const shapePreview = useMemo<StrokeDraft | null>(() => {
    if (toolState.selectedTool !== 'shape' || !toolState.hoverPoint) return null
    return {
      points: createShapePoints(toolState.hoverPoint, toolState.shape, toolState.shapeSize),
      style: { color: toolState.color, lineWidth: toolState.lineWidth },
      brush: 'auto',
    }
  }, [toolState.color, toolState.hoverPoint, toolState.lineWidth, toolState.selectedTool, toolState.shape, toolState.shapeSize])
  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0
  const hasVisibleArtwork = documentState.strokes.length > 0 || documentState.fills.length > 0 || documentState.backgroundColor !== DEFAULT_BACKGROUND_COLOR
  const canEditLayer = Boolean(activeLayer?.visible && !activeLayer.locked)
  const selectedItemCount = (selection?.strokeIds.length ?? 0) + (selection?.fillIds.length ?? 0)
  const cursorTool = isSpacePressed ? 'hand' : toolState.selectedTool
  const documentColors = useMemo(() => {
    const colors: string[] = []
    const seen = new Set<string>()
    const addColor = (color: string) => {
      const normalized = normalizeHexColor(color)
      if (!normalized || seen.has(normalized)) return
      seen.add(normalized)
      colors.push(normalized)
    }
    const visibleLayerIds = new Set(documentState.layers.filter((layer) => layer.visible && layer.opacity > 0).map((layer) => layer.id))

    addColor(documentState.backgroundColor)
    for (const stroke of documentState.strokes) if (visibleLayerIds.has(stroke.layerId)) addColor(stroke.style.color)
    for (const fill of documentState.fills) if (visibleLayerIds.has(fill.layerId)) addColor(fill.color)
    if (toolState.activeStroke && visibleLayerIds.has(documentState.activeLayerId)) addColor(toolState.activeStroke.style.color)
    return colors
  }, [documentState, toolState.activeStroke])

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return

    const updateSize = () => {
      const { width, height } = workspace.getBoundingClientRect()
      const next = { width: Math.max(320, Math.round(width)), height: Math.max(280, Math.round(height)) }
      setCanvasSize((current) => current.width === next.width && current.height === next.height ? current : next)
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(workspace)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    loadRecoverySnapshot().then((snapshot) => {
      if (cancelled) return
      if (snapshot && snapshot.savedAt > initialSavedAtRef.current) {
        const recoveredDocument = syncDocumentCanvas(snapshot.document, snapshot.document.canvas)
        setHistory((current) => current.past.length > 0 ? current : createHistory(recoveredDocument))
        setToolState((current) => ({
          ...current,
          activeStroke: snapshot.activeStroke ?? null,
          mirrorX: snapshot.mirrorX ?? current.mirrorX,
          mirrorY: snapshot.mirrorY ?? current.mirrorY,
          selectedTool: snapshot.selectedTool ?? current.selectedTool,
        }))
        initialSavedAtRef.current = snapshot.savedAt
        lastRecoverySaveRef.current = snapshot.savedAt
        setHasRecovery(true)
        setNotice(snapshot.activeStroke ? 'Recovered drawing and unfinished path' : 'Recovered latest drawing')
      }
      setIsPersistenceReady(true)
      setSaveState('saved')
    }).catch(() => {
      setIsPersistenceReady(true)
      setSaveState('error')
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    savePreferences(preferences)
  }, [preferences])

  useEffect(() => {
    if (!isPersistenceReady) return

    setSaveState('saving')
    const elapsedSinceSave = Math.max(0, Date.now() - lastRecoverySaveRef.current)
    const saveDelay = Math.max(120, RECOVERY_SAVE_INTERVAL_MS - elapsedSinceSave)
    const timer = window.setTimeout(() => {
      const snapshot: RecoverySnapshot = {
        savedAt: Date.now(),
        document: history.present,
        activeStroke: toolState.activeStroke,
        mirrorX: toolState.mirrorX,
        mirrorY: toolState.mirrorY,
        selectedTool: toolState.selectedTool,
      }
      initialSavedAtRef.current = snapshot.savedAt
      lastRecoverySaveRef.current = snapshot.savedAt
      saveLocalRecoverySnapshot(snapshot)

      saveRecoverySnapshot(snapshot).then(() => {
        setSaveState('saved')
      }).catch(() => {
        setSaveState('error')
        setNotice('Recovery storage is unavailable — export a JSON backup')
      })
    }, saveDelay)
    return () => window.clearTimeout(timer)
  }, [history.present, isPersistenceReady, toolState.activeStroke, toolState.mirrorX, toolState.mirrorY, toolState.selectedTool])

  useEffect(() => {
    if (!isPersistenceReady) return

    const persistImmediately = () => {
      const snapshot: RecoverySnapshot = {
        savedAt: Date.now(),
        document: history.present,
        activeStroke: toolState.activeStroke,
        mirrorX: toolState.mirrorX,
        mirrorY: toolState.mirrorY,
        selectedTool: toolState.selectedTool,
      }
      saveLocalRecoverySnapshot(snapshot)
      void saveRecoverySnapshot(snapshot)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persistImmediately()
    }

    window.addEventListener('pagehide', persistImmediately)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', persistImmediately)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [history.present, isPersistenceReady, toolState.activeStroke, toolState.mirrorX, toolState.mirrorY, toolState.selectedTool])

  useEffect(() => {
    const canvas = gridCanvasRef.current
    if (!canvas) return
    drawGridLayer(configureCanvas(canvas, canvasSize), canvasSize, gridMetrics, viewport, showGridDots, preferences.gridDotColor)
  }, [canvasSize, gridMetrics, preferences.gridDotColor, showGridDots, viewport])

  useEffect(() => {
    const canvas = drawingCanvasRef.current
    if (!canvas) return
    drawDrawingSurface(configureCanvas(canvas, canvasSize), canvasSize, gridMetrics, viewport, documentState)
  }, [canvasSize, documentState, gridMetrics, viewport])

  useEffect(() => {
    const canvas = activeCanvasRef.current
    if (!canvas) return
    drawActiveStrokeLayer(
      configureCanvas(canvas, canvasSize),
      canvasSize,
      gridMetrics,
      viewport,
      toolState.activeStroke,
      toolState.mirrorX,
      toolState.mirrorY,
    )
  }, [canvasSize, gridMetrics, toolState.activeStroke, toolState.mirrorX, toolState.mirrorY, viewport])

  useEffect(() => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    drawOverlay(configureCanvas(canvas, canvasSize), canvasSize, gridMetrics, viewport, {
      activeStroke: toolState.activeStroke,
      hoverPoint: toolState.hoverPoint,
      hoveredStroke: toolState.selectedTool === 'erase' && hoveredStroke?.layerId === activeLayer?.id ? hoveredStroke : null,
      pickerPoint,
      shapePreview,
      preferDiagonalPreview: toolState.selectedTool === 'draw' && isAltPressed,
      mirrorX: toolState.mirrorX,
      mirrorY: toolState.mirrorY,
      selectionBounds: selection?.bounds ?? null,
    })
  }, [activeLayer?.id, canvasSize, gridMetrics, hoveredStroke, isAltPressed, pickerPoint, selection?.bounds, shapePreview, toolState.activeStroke, toolState.hoverPoint, toolState.mirrorX, toolState.mirrorY, toolState.selectedTool, viewport])

  const resetTransientState = () => {
    previewDocumentRef.current = null
    setPreviewDocument(null)
    eraseSessionRef.current = null
    selectionSessionRef.current = null
    setSelection(null)
    setPickerPoint(null)
    setToolState((current) => ({ ...current, activeStroke: null, hoverPoint: null, hoveredStrokeId: null }))
  }

  const finishActivePath = () => {
    const draft = toolState.activeStroke
    setToolState((current) => ({ ...current, activeStroke: null, hoverPoint: null }))

    if (!draft || draft.points.length < 2 || !canEditLayer) return

    setHistory((value) => pushHistory(value, commitStrokeWithMirrors(syncDocumentCanvas(value.present, canvasSize), draft, toolState.mirrorX, toolState.mirrorY)))
    setNotice('Path committed')
  }

  const undoLatestAction = () => {
    resetTransientState()
    setHistory((value) => undoHistory(value))
    setNotice('Undo')
  }

  const redoLatestAction = () => {
    resetTransientState()
    setHistory((value) => redoHistory(value))
    setNotice('Redo')
  }

  const handleCopySelection = () => {
    if (!selection) return
    const copied = copySelectedContent(persistedDocument, selection)
    if (!copied) {
      setNotice('The selection does not contain editable items')
      return
    }
    setSelectionClipboard(copied)
    const itemCount = copied.strokes.length + copied.fills.length
    setNotice(`${itemCount} ${itemCount === 1 ? 'item' : 'items'} copied`)
  }

  const handlePasteSelection = () => {
    if (!selectionClipboard || !canEditLayer) return
    const result = pasteSelectedContent(syncDocumentCanvas(history.present, canvasSize), selectionClipboard)
    resetTransientState()
    setHistory((value) => pushHistory(value, result.document))
    setSelection(result.selection)
    setToolState((current) => ({ ...current, selectedTool: 'select' }))
    const itemCount = result.selection.strokeIds.length + result.selection.fillIds.length
    setNotice(`${itemCount} ${itemCount === 1 ? 'item' : 'items'} pasted`)
  }

  const handleTransformSelection = (transform: SelectionTransform) => {
    if (!selection || !canEditLayer || selection.strokeIds.length + selection.fillIds.length === 0) return
    const result = transformSelectedContent(syncDocumentCanvas(history.present, canvasSize), selection, transform)
    previewDocumentRef.current = null
    setPreviewDocument(null)
    setHistory((value) => pushHistory(value, result.document))
    setSelection(result.selection)
    setNotice(transform === 'rotate90' ? 'Selection rotated 90°' : transform === 'flipHorizontal' ? 'Selection flipped horizontally' : 'Selection flipped vertically')
  }

  finishActivePathRef.current = finishActivePath
  undoLatestActionRef.current = undoLatestAction
  redoLatestActionRef.current = redoLatestAction

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      const modifier = event.metaKey || event.ctrlKey
      setIsAltPressed(event.altKey)

      if (event.code === 'Space') {
        event.preventDefault()
        setIsSpacePressed(true)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        resetTransientState()
        setNotice('Action cancelled')
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        finishActivePathRef.current()
        return
      }
      if (modifier && key === 'c') {
        event.preventDefault()
        handleCopySelection()
        return
      }
      if (modifier && key === 'v') {
        event.preventDefault()
        handlePasteSelection()
        return
      }
      if (modifier && key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undoLatestActionRef.current()
        return
      }
      if ((modifier && key === 'y') || (modifier && event.shiftKey && key === 'z')) {
        event.preventDefault()
        redoLatestActionRef.current()
        return
      }
      if (event.key === '[' || event.key === ']') {
        event.preventDefault()
        const delta = event.key === '[' ? -1 : 1
        setToolState((current) => ({ ...current, lineWidth: clamp(current.lineWidth + delta, MIN_LINE_WIDTH, MAX_LINE_WIDTH) }))
        return
      }
      const shortcut = TOOL_OPTIONS.find((tool) => tool.shortcut.toLowerCase() === key)
      if (shortcut) handleToolChange(shortcut.id)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      setIsAltPressed(event.altKey)
      if (event.code === 'Space') setIsSpacePressed(false)
    }
    const onBlur = () => {
      setIsAltPressed(false)
      setIsSpacePressed(false)
      panStateRef.current = null
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  })

  const localPoint = (event: { currentTarget: HTMLCanvasElement; clientX: number; clientY: number }) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const eraseAtCanvasPoint = (screenX: number, screenY: number) => {
    const worldPoint = screenPointToWorldPoint(screenX, screenY, canvasSize, viewport)
    const base = previewDocumentRef.current ?? persistedDocument
    const next = eraseDocumentAtWorldPoint(base, worldPoint, gridMetrics.spacing, viewport.zoom, toolState.lineWidth, base.activeLayerId)
    previewDocumentRef.current = next
    setPreviewDocument(next)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event)
    setIsAltPressed(event.altKey)
    if (panStateRef.current?.pointerId === event.pointerId) {
      const pan = panStateRef.current
      setViewport({ ...pan.viewport, x: pan.viewport.x - (point.x - pan.startX) / pan.viewport.zoom, y: pan.viewport.y - (point.y - pan.startY) / pan.viewport.zoom })
      return
    }
    if (eraseSessionRef.current?.pointerId === event.pointerId) {
      eraseAtCanvasPoint(point.x, point.y)
      return
    }
    if (selectionSessionRef.current?.pointerId === event.pointerId) {
      const end = snapScreenPointToGrid(point.x, point.y, canvasSize, viewport, gridMetrics)
      if (!end) return
      selectionSessionRef.current.end = end
      setSelection({ bounds: normalizeSelectionBounds(selectionSessionRef.current.start, end), strokeIds: [], fillIds: [] })
      return
    }
    const visibleStroke = findStrokeAtCanvasPoint(visibleStrokes, gridMetrics, canvasSize, viewport, point)
    if (toolState.selectedTool === 'erase') {
      const stroke = findStrokeAtCanvasPoint(activeLayerStrokes, gridMetrics, canvasSize, viewport, point)
      const hoveredStrokeId = stroke?.id ?? null
      setToolState((current) => current.hoverPoint === null && current.hoveredStrokeId === hoveredStrokeId
        ? current
        : { ...current, hoverPoint: null, hoveredStrokeId })
      return
    }
    if (toolState.selectedTool === 'picker') {
      setPickerPoint(screenPointToWorldPoint(point.x, point.y, canvasSize, viewport))
      setToolState((current) => ({ ...current, hoverPoint: null, hoveredStrokeId: visibleStroke?.id ?? null }))
      return
    }
    if (!['draw', 'curve', 'shape'].includes(toolState.selectedTool)) {
      const hoveredStrokeId = visibleStroke?.id ?? null
      setToolState((current) => current.hoverPoint === null && current.hoveredStrokeId === hoveredStrokeId
        ? current
        : { ...current, hoverPoint: null, hoveredStrokeId })
      return
    }
    const hoverPoint = snapScreenPointToGrid(point.x, point.y, canvasSize, viewport, gridMetrics)
    setPickerPoint(null)
    setToolState((current) => ({ ...current, hoverPoint, hoveredStrokeId: visibleStroke?.id ?? null }))
  }

  const handlePointerLeave = () => {
    if (eraseSessionRef.current || panStateRef.current || selectionSessionRef.current) return
    setPickerPoint(null)
    setToolState((current) => ({ ...current, hoverPoint: null, hoveredStrokeId: null }))
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = localPoint(event)
    if (event.button === 2 && toolState.activeStroke && ['draw', 'curve'].includes(toolState.selectedTool)) {
      finishActivePath()
      return
    }
    if (event.button === 2 || cursorTool === 'hand') {
      event.currentTarget.setPointerCapture(event.pointerId)
      panStateRef.current = { pointerId: event.pointerId, startX: point.x, startY: point.y, viewport }
      return
    }
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)

    if (toolState.selectedTool === 'zoom') {
      zoomAtPoint(point, event.altKey ? 1 / 1.25 : 1.25)
      return
    }
    if (toolState.selectedTool === 'picker') {
      const color = sampleSceneColorAtCanvasPoint(documentState, gridMetrics, canvasSize, viewport, point)
      if (color) setToolState((current) => ({ ...current, color }))
      return
    }
    if (!canEditLayer) {
      setNotice(activeLayer?.locked ? 'Unlock the active layer to edit it' : 'Show the active layer to edit it')
      return
    }
    if (toolState.selectedTool === 'select') {
      const start = snapScreenPointToGrid(point.x, point.y, canvasSize, viewport, gridMetrics)
      if (!start) return
      selectionSessionRef.current = { pointerId: event.pointerId, start, end: start }
      setSelection({ bounds: normalizeSelectionBounds(start, start), strokeIds: [], fillIds: [] })
      setNotice('Drag to select on the grid')
      return
    }
    if (toolState.selectedTool === 'erase') {
      eraseSessionRef.current = { pointerId: event.pointerId }
      eraseAtCanvasPoint(point.x, point.y)
      return
    }
    if (toolState.selectedTool === 'bucket' || toolState.selectedTool === 'patternBucket') {
      const action = resolveBucketActionAtCanvasPoint(documentState, gridMetrics, canvasSize, viewport, point)
      if (action === 'stroke') return
      const isPatternFill = toolState.selectedTool === 'patternBucket'
      setHistory((value) => {
        const doc = syncDocumentCanvas(value.present, canvasSize)
        if (action === 'background' && !isPatternFill) return pushHistory(value, setBackgroundColor(doc, toolState.color))
        const fill = {
          color: toolState.color,
          seed: screenPointToWorldPoint(point.x, point.y, canvasSize, viewport),
          pattern: isPatternFill ? toolState.pattern : undefined,
          extendsToCanvasEdge: isPatternFill && action === 'background',
        }
        return pushHistory(value, action === 'background'
          ? addFill(doc, fill)
          : addFillWithMirrors(doc, fill, toolState.mirrorX, toolState.mirrorY))
      })
      setNotice(isPatternFill ? 'Pattern fill applied' : action === 'background' ? 'Background color updated' : 'Region filled')
      return
    }
    if (toolState.selectedTool === 'shape') {
      const center = snapScreenPointToGrid(point.x, point.y, canvasSize, viewport, gridMetrics)
      if (!center) return
      const shapeDraft: StrokeDraft = {
        points: createShapePoints(center, toolState.shape, toolState.shapeSize),
        style: { color: toolState.color, lineWidth: toolState.lineWidth },
        brush: 'auto',
      }
      setHistory((value) => pushHistory(
        value,
        commitStrokeWithMirrors(syncDocumentCanvas(value.present, canvasSize), shapeDraft, toolState.mirrorX, toolState.mirrorY),
      ))
      setNotice(`${SHAPE_OPTIONS.find((shape) => shape.id === toolState.shape)?.label ?? 'Shape'} placed`)
      return
    }
    if (!['draw', 'curve'].includes(toolState.selectedTool)) return
    const nextPoint = snapScreenPointToGrid(point.x, point.y, canvasSize, viewport, gridMetrics)
    if (!nextPoint) return
    const preferDiagonal = toolState.selectedTool === 'draw' && (event.altKey || isAltPressed)
    if (!toolState.activeStroke) {
      setToolState((current) => ({
        ...current,
        activeStroke: { points: [nextPoint], style: { color: current.color, lineWidth: current.lineWidth }, brush: getBrushForTool(current.selectedTool) },
        hoverPoint: nextPoint,
      }))
      return
    }

    const nextDraft = {
      ...toolState.activeStroke,
      points: appendSegmentPoints(toolState.activeStroke.points, nextPoint, toolState.activeStroke.brush, preferDiagonal),
    }

    if (nextDraft.points.length >= MAX_ACTIVE_STROKE_POINTS) {
      setHistory((value) => pushHistory(
        value,
        commitStrokeWithMirrors(syncDocumentCanvas(value.present, canvasSize), nextDraft, toolState.mirrorX, toolState.mirrorY),
      ))
      setToolState((current) => ({
        ...current,
        activeStroke: { ...nextDraft, points: [nextPoint] },
        hoverPoint: nextPoint,
      }))
      setNotice('Long path checkpoint saved')
      return
    }

    setToolState((current) => ({ ...current, activeStroke: nextDraft, hoverPoint: nextPoint }))
  }

  const finishPointerSession = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (panStateRef.current?.pointerId === event.pointerId) panStateRef.current = null
    if (selectionSessionRef.current?.pointerId === event.pointerId) {
      const session = selectionSessionRef.current
      selectionSessionRef.current = null
      const nextSelection = selectContentInBounds(documentState, normalizeSelectionBounds(session.start, session.end))
      setSelection(nextSelection)
      const itemCount = nextSelection.strokeIds.length + nextSelection.fillIds.length
      setNotice(itemCount === 0 ? 'Empty selection' : `${itemCount} ${itemCount === 1 ? 'item' : 'items'} selected`)
    }
    if (eraseSessionRef.current?.pointerId === event.pointerId) {
      eraseSessionRef.current = null
      const preview = previewDocumentRef.current
      if (preview && preview !== persistedDocument) setHistory((value) => pushHistory(value, syncDocumentCanvas(preview, canvasSize)))
      previewDocumentRef.current = null
      setPreviewDocument(null)
      setToolState((current) => ({ ...current, hoveredStrokeId: null }))
      setNotice('Erase committed')
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const zoomAtPoint = (point: { x: number; y: number }, factor: number) => {
    setViewport((current) => {
      const world = screenPointToWorldPoint(point.x, point.y, canvasSize, current)
      const zoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM)
      return { zoom, x: world.x - (point.x - canvasSize.width / 2) / zoom, y: world.y - (point.y - canvasSize.height / 2) / zoom }
    })
  }

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    zoomAtPoint(localPoint(event), Math.exp(-event.deltaY * 0.0015))
  }

  const handleToolChange = (selectedTool: ToolMode) => {
    resetTransientState()
    setToolState((current) => ({ ...current, selectedTool }))
    setNotice(TOOL_OPTIONS.find((tool) => tool.id === selectedTool)?.label ?? 'Ready')
  }

  const updateDocument = (updater: (documentState: DrawingDocument) => DrawingDocument, message?: string, record = true) => {
    resetTransientState()
    setHistory((value) => {
      const next = updater(syncDocumentCanvas(value.present, canvasSize))
      return record ? pushHistory(value, next) : { ...value, present: next }
    })
    if (message) setNotice(message)
  }

  const handleClearLayer = () => {
    if (!activeLayer || (activeLayerStrokes.length === 0 && !documentState.fills.some((fill) => fill.layerId === activeLayer.id))) return
    if (!window.confirm(`Clear all artwork from “${activeLayer.name}”?`)) return
    updateDocument(clearActiveLayer, 'Layer cleared')
  }

  const handleCreateDrawing = (spacing: number) => {
    setDraftSpacing(spacing)
    setViewport({ x: 0, y: 0, zoom: 1 })
    resetTransientState()
    setHistory(createHistory(createDocument(spacing, canvasSize, preferences.canvasBackgroundColor, draftName)))
    setHasRecovery(true)
    setImportError(null)
    setIsStartupDialog(false)
    setIsDialogOpen(false)
    setNotice('New document created')
  }

  const handleImportDrawing = async (file: File) => {
    setImportError(null)
    if (file.size > 25 * 1024 * 1024) {
      setImportError('This file is larger than 25 MB. Choose a smaller Lines on Grids backup.')
      return
    }
    try {
      const imported = parseDocumentJson(await file.text())
      setViewport({ x: 0, y: 0, zoom: 1 })
      resetTransientState()
      setHistory(createHistory(imported))
      setDraftSpacing(imported.grid.spacing)
      setDraftName(imported.name)
      setHasRecovery(true)
      setIsStartupDialog(false)
      setIsDialogOpen(false)
      setNotice(`Opened ${file.name}`)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'This JSON file could not be opened.')
    }
  }

  const openDocumentDialog = () => {
    setDraftSpacing(documentState.grid.spacing)
    setDraftName(documentState.name)
    setImportError(null)
    setIsStartupDialog(false)
    setIsDialogOpen(true)
  }

  const fitToScreen = () => setViewport({ x: 0, y: 0, zoom: 1 })
  const exportJson = () => {
    downloadDocumentJson(exportableDocument, getDocumentFilename(exportableDocument.name, 'json'))
    setNotice('JSON backup saved')
  }
  const exportPng = (bounds: GridExportBounds, options: DrawingExportOptions) => {
    try {
      downloadDrawingPng(exportableDocument, getDocumentFilename(exportableDocument.name, 'png'), bounds, options)
      setIsExportOpen(false)
      setNotice('PNG export created')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'PNG export failed')
    }
  }
  const exportSvg = (bounds: GridExportBounds, options: DrawingExportOptions) => {
    try {
      downloadDrawingSvg(exportableDocument, getDocumentFilename(exportableDocument.name, 'svg'), bounds, options)
      setIsExportOpen(false)
      setNotice('SVG export created')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'SVG export failed')
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">LG</div>
        <div className="document-title"><strong>{documentState.name}</strong><span>Lines on Grids</span></div>
        <nav className="header-actions" aria-label="Document actions">
          <button type="button" onClick={openDocumentDialog}>New / Open</button>
          <span className="toolbar-divider" />
          <IconButton label="Undo" icon="undo" onClick={undoLatestAction} disabled={!canUndo} />
          <IconButton label="Redo" icon="redo" onClick={redoLatestAction} disabled={!canRedo} />
          <span className="toolbar-divider" />
          <button type="button" onClick={exportJson}>Save JSON</button>
          <IconButton label="Settings" icon="settings" onClick={() => setIsSettingsOpen(true)} />
          <button type="button" className="primary-action" onClick={() => setIsExportOpen(true)}>Export</button>
        </nav>
      </header>

      <section className="options-bar" aria-label="Tool options">
        <div className="active-tool-name"><ToolIcon name={toolState.selectedTool} /><span>{TOOL_OPTIONS.find((tool) => tool.id === toolState.selectedTool)?.label}</span></div>
        {!['select', 'hand', 'zoom'].includes(toolState.selectedTool) ? <>
          <span className="toolbar-divider" />
          <label className="color-control" title="Foreground color">
            <span>Color</span>
            <input type="color" value={toolState.color} onChange={(event) => setToolState((current) => ({ ...current, color: event.target.value }))} />
            <code>{toolState.color.toUpperCase()}</code>
          </label>
        </> : null}
        {toolState.selectedTool === 'select' ? <>
          <span className="toolbar-divider" />
          <div className="selection-options" aria-label="Selection actions">
            <span>{selectedItemCount} selected</span>
            <button type="button" onClick={handleCopySelection} disabled={selectedItemCount === 0}>Copy</button>
            <button type="button" onClick={handlePasteSelection} disabled={!selectionClipboard}>Paste</button>
            <button type="button" onClick={() => handleTransformSelection('rotate90')} disabled={selectedItemCount === 0}>Rotate 90°</button>
            <button type="button" onClick={() => handleTransformSelection('flipHorizontal')} disabled={selectedItemCount === 0}>Flip H</button>
            <button type="button" onClick={() => handleTransformSelection('flipVertical')} disabled={selectedItemCount === 0}>Flip V</button>
          </div>
        </> : null}
        {['draw', 'curve', 'shape', 'erase'].includes(toolState.selectedTool) ? <>
          <span className="toolbar-divider" />
          <label className="width-control">
            <span>{toolState.selectedTool === 'erase' ? 'Size' : 'Line width'}</span>
            <input type="range" min={MIN_LINE_WIDTH} max={MAX_LINE_WIDTH} value={toolState.lineWidth} onChange={(event) => setToolState((current) => ({ ...current, lineWidth: Number(event.target.value) }))} />
            <input type="number" min={MIN_LINE_WIDTH} max={MAX_LINE_WIDTH} value={toolState.lineWidth} onChange={(event) => setToolState((current) => ({ ...current, lineWidth: clamp(Number(event.target.value), MIN_LINE_WIDTH, MAX_LINE_WIDTH) }))} />
            <span>px</span>
          </label>
        </> : null}
        {toolState.selectedTool === 'shape' ? <>
          <span className="toolbar-divider" />
          <div className="shape-options" aria-label="Shape presets">
            <span>Shape</span>
            {SHAPE_OPTIONS.map((shape) => (
              <button key={shape.id} type="button" className="shape-preset" aria-label={shape.label} aria-pressed={toolState.shape === shape.id} title={shape.label} onClick={() => setToolState((current) => ({ ...current, shape: shape.id }))}>
                <ShapePresetIcon name={shape.id} />
              </button>
            ))}
          </div>
          <label className="shape-size-control">
            <span>Size</span>
            <input type="range" min={MIN_SHAPE_SIZE} max={MAX_SHAPE_SIZE} step={SHAPE_SIZE_STEP} value={toolState.shapeSize} onChange={(event) => setToolState((current) => ({ ...current, shapeSize: normalizeShapeSize(Number(event.target.value)) }))} />
            <input type="number" min={MIN_SHAPE_SIZE} max={MAX_SHAPE_SIZE} step={SHAPE_SIZE_STEP} value={toolState.shapeSize} onChange={(event) => setToolState((current) => ({ ...current, shapeSize: normalizeShapeSize(Number(event.target.value)) }))} />
            <span>cells</span>
          </label>
        </> : null}
        {['draw', 'curve', 'shape', 'bucket', 'patternBucket'].includes(toolState.selectedTool) ? <>
          <span className="toolbar-divider" />
          <div className="mirror-options" aria-label="Mirror drawing options">
            <span>Mirror</span>
            <button type="button" aria-label="Mirror X across the vertical centerline" aria-pressed={toolState.mirrorX} title="Mirror X · left/right" onClick={() => setToolState((current) => ({ ...current, mirrorX: !current.mirrorX }))}>X</button>
            <button type="button" aria-label="Mirror Y across the horizontal centerline" aria-pressed={toolState.mirrorY} title="Mirror Y · top/bottom" onClick={() => setToolState((current) => ({ ...current, mirrorY: !current.mirrorY }))}>Y</button>
          </div>
        </> : null}
        {toolState.selectedTool === 'patternBucket' ? <>
          <span className="toolbar-divider" />
          <div className="pattern-options" aria-label="Dither pattern presets">
            <span>Pattern</span>
            {DITHER_PRESETS.map((preset) => (
              <button key={preset.id} type="button" className={`pattern-preset pattern-${preset.id}`} aria-label={preset.label} aria-pressed={toolState.pattern === preset.id} title={preset.label} onClick={() => setToolState((current) => ({ ...current, pattern: preset.id }))} />
            ))}
          </div>
        </> : null}
        <span className="options-hint">{['draw', 'curve'].includes(toolState.selectedTool) ? 'Click dots to build a path · Right-click or Enter to finish · Alt for direct segments' : toolState.selectedTool === 'shape' ? 'Click a grid point to place the shape' : toolState.selectedTool === 'select' ? 'Drag a grid rectangle around paths and fills · Ctrl/Cmd+C and Ctrl/Cmd+V' : toolState.selectedTool === 'patternBucket' ? 'Choose a preset, then click a region or the open canvas to apply the pattern' : 'Space-drag to pan · Mouse wheel to zoom'}</span>
      </section>

      <aside className="tool-dock" aria-label="Tools">
        <div className="tool-stack">
          {TOOL_OPTIONS.map((tool) => (
            <button key={tool.id} type="button" className="tool-button" aria-label={`${tool.label} (${tool.shortcut})`} aria-pressed={toolState.selectedTool === tool.id} onClick={() => handleToolChange(tool.id)} data-tooltip={`${tool.label}  ${tool.shortcut}`}>
              <ToolIcon name={tool.id} />
            </button>
          ))}
        </div>
        <div className="foreground-control">
          <input aria-label="Foreground color" type="color" value={toolState.color} onChange={(event) => setToolState((current) => ({ ...current, color: event.target.value }))} />
          <button type="button" aria-label="Reset colors" onClick={() => setToolState((current) => ({ ...current, color: '#111111' }))}>D</button>
        </div>
      </aside>

      <section className="workspace-shell">
        <div className="workspace" ref={workspaceRef}>
          <canvas ref={drawingCanvasRef} className="canvas-layer drawing-layer" aria-hidden="true" />
          <canvas ref={gridCanvasRef} className="canvas-layer grid-layer" aria-hidden="true" />
          <canvas ref={activeCanvasRef} className="canvas-layer active-path-layer" aria-hidden="true" />
          <canvas
            ref={overlayCanvasRef}
            className={`canvas-layer overlay-layer cursor-${cursorTool}`}
            aria-label="Grid drawing canvas"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            onPointerDown={handlePointerDown}
            onPointerUp={finishPointerSession}
            onPointerCancel={finishPointerSession}
            onContextMenu={(event) => event.preventDefault()}
            onWheel={handleWheel}
          />
        </div>
        <footer className="status-bar">
          <span>{notice}</span>
          <span className={`save-indicator save-${saveState}`} aria-live="polite">
            {saveState === 'loading' ? 'Loading recovery…' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Recovery unavailable' : 'Saved'}
          </span>
          <span className="status-spacer" />
          {hoveredStroke ? <span className="hover-width-indicator">Line width <strong>{hoveredStroke.style.lineWidth}</strong> px</span> : null}
          <button type="button" onClick={fitToScreen}>Fit</button>
          <button type="button" aria-pressed={showGridDots} onClick={() => setShowGridDots((visible) => !visible)}>Grid</button>
          <span>{Math.round(viewport.zoom * 100)}%</span>
          <span>{documentState.grid.spacing}px grid</span>
          <span>{documentState.strokes.length} paths</span>
        </footer>
      </section>

      <aside className="properties-panel" aria-label="Panels">
        <section className="panel-section color-panel">
          <div className="panel-heading"><strong>Color</strong><span>{toolState.color.toUpperCase()}</span></div>
          <ColorWheel color={toolState.color} onChange={(color) => setToolState((current) => ({ ...current, color }))} />
          <div className="palette-heading"><span>Swatches</span><span>{COLOR_SWATCHES.length}</span></div>
          <div className="swatch-grid" aria-label="Color swatches">
            {COLOR_SWATCHES.map((color) => <button key={color} type="button" className="swatch" aria-label={`Use ${color}`} aria-pressed={toolState.color === color} style={{ backgroundColor: color }} onClick={() => setToolState((current) => ({ ...current, color }))} />)}
          </div>
          <div className="palette-heading document-palette-heading"><span>Document colors</span><span>{documentColors.length}</span></div>
          <div className="swatch-grid document-swatch-grid" aria-label="Colors currently visible in the document">
            {documentColors.map((color) => <button key={color} type="button" className="swatch" aria-label={`Use document color ${color}`} aria-pressed={toolState.color === color} title={color.toUpperCase()} style={{ backgroundColor: color }} onClick={() => setToolState((current) => ({ ...current, color }))} />)}
          </div>
        </section>

        <section className="panel-section layers-panel">
          <div className="panel-heading"><strong>Layers</strong><span>{documentState.layers.length}</span></div>
          <label className="opacity-control"><span>Opacity</span><input type="range" min="0" max="100" value={Math.round((activeLayer?.opacity ?? 1) * 100)} onChange={(event) => activeLayer && updateDocument((doc) => updateLayer(doc, activeLayer.id, { opacity: Number(event.target.value) / 100 }))} /><output>{Math.round((activeLayer?.opacity ?? 1) * 100)}%</output></label>
          <div className="layer-list">
            {[...documentState.layers].reverse().map((layer) => {
              const itemCount = documentState.strokes.filter((stroke) => stroke.layerId === layer.id).length + documentState.fills.filter((fill) => fill.layerId === layer.id).length
              return (
                <div key={layer.id} className="layer-row" data-active={layer.id === documentState.activeLayerId} onClick={() => updateDocument((doc) => setActiveLayer(doc, layer.id), undefined, false)}>
                  <button type="button" className="layer-icon-button" aria-label={layer.visible ? 'Hide layer' : 'Show layer'} onClick={(event) => { event.stopPropagation(); updateDocument((doc) => updateLayer(doc, layer.id, { visible: !layer.visible })) }}><MiniIcon name={layer.visible ? 'eye' : 'eye-off'} /></button>
                  <div className="layer-thumbnail"><span style={{ backgroundColor: toolState.color }} /></div>
                  <div className="layer-copy"><input aria-label="Layer name" value={layer.name} onClick={(event) => event.stopPropagation()} onChange={(event) => updateDocument((doc) => updateLayer(doc, layer.id, { name: event.target.value }), undefined, false)} /><span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span></div>
                  <button type="button" className="layer-icon-button" aria-label={layer.locked ? 'Unlock layer' : 'Lock layer'} onClick={(event) => { event.stopPropagation(); updateDocument((doc) => updateLayer(doc, layer.id, { locked: !layer.locked })) }}><MiniIcon name={layer.locked ? 'lock' : 'unlock'} /></button>
                </div>
              )
            })}
            <div className="background-row"><MiniIcon name="eye" /><span className="background-chip" style={{ background: documentState.backgroundColor }} /><div><strong>Background</strong><span>Locked</span></div><MiniIcon name="lock" /></div>
          </div>
          <div className="layer-actions">
            <IconButton label="Add layer" icon="plus" onClick={() => updateDocument(addLayer, 'Layer added')} />
            <IconButton label="Duplicate layer" icon="duplicate" onClick={() => activeLayer && updateDocument((doc) => duplicateLayer(doc, activeLayer.id), 'Layer duplicated')} />
            <IconButton label="Move layer up" icon="up" onClick={() => activeLayer && updateDocument((doc) => moveLayer(doc, activeLayer.id, 1))} />
            <IconButton label="Move layer down" icon="down" onClick={() => activeLayer && updateDocument((doc) => moveLayer(doc, activeLayer.id, -1))} />
            <span className="layer-action-spacer" />
            <IconButton label="Clear layer" icon="clear" onClick={handleClearLayer} disabled={!hasVisibleArtwork} />
            <IconButton label="Delete layer" icon="trash" onClick={() => activeLayer && updateDocument((doc) => removeLayer(doc, activeLayer.id), 'Layer deleted')} disabled={documentState.layers.length <= 1} />
          </div>
        </section>
      </aside>

      <NewDrawingDialog
        isOpen={isDialogOpen}
        spacing={draftSpacing}
        name={draftName}
        minSpacing={MIN_GRID_SPACING}
        maxSpacing={MAX_GRID_SPACING}
        onSpacingChange={setDraftSpacing}
        onNameChange={setDraftName}
        onConfirm={handleCreateDrawing}
        onClose={() => { setImportError(null); setIsDialogOpen(false) }}
        onImport={handleImportDrawing}
        isStartup={isStartupDialog}
        canContinue={hasRecovery}
        error={importError}
      />
      <ExportDialog
        isOpen={isExportOpen}
        documentState={exportableDocument}
        artworkBounds={artworkBounds}
        onExportPng={exportPng}
        onExportSvg={exportSvg}
        onClose={() => setIsExportOpen(false)}
      />
      <SettingsDialog
        isOpen={isSettingsOpen}
        preferences={preferences}
        canvasBackgroundColor={documentState.backgroundColor}
        onBackgroundColorChange={(color) => updateDocument((doc) => setBackgroundColor(doc, color), 'Background updated')}
        onPreferencesChange={setPreferences}
        onClose={() => setIsSettingsOpen(false)}
      />
    </main>
  )
}

export default App

function getBrushForTool(tool: ToolMode): BrushMode {
  return tool === 'curve' ? 'curve' : 'auto'
}

function eraseDocumentAtWorldPoint(documentState: DrawingDocument, worldPoint: WorldPoint, spacing: number, zoom: number, lineWidth: number, layerId: string) {
  const radius = Math.max(6, lineWidth / 2 + 3) / zoom
  const nextStrokes: Stroke[] = []
  let changed = false
  for (const stroke of documentState.strokes) {
    if (stroke.layerId !== layerId || !strokeIntersectsBrush(stroke, worldPoint, spacing, radius)) {
      nextStrokes.push(stroke)
      continue
    }
    const segments = splitStrokeByBrush(stroke, worldPoint, spacing, radius)
    changed = true
    nextStrokes.push(...segments)
  }
  return changed ? { ...documentState, strokes: nextStrokes } : documentState
}

function strokeIntersectsBrush(stroke: Stroke, point: WorldPoint, spacing: number, radius: number) {
  for (let index = 1; index < stroke.points.length; index += 1) {
    const start = gridPointToWorldPoint(stroke.points[index - 1], { spacing })
    const end = gridPointToWorldPoint(stroke.points[index], { spacing })
    if (distanceToSegment(point, start, end) <= radius + stroke.style.lineWidth / 2) return true
  }
  return false
}

function splitStrokeByBrush(stroke: Stroke, worldPoint: WorldPoint, spacing: number, radius: number) {
  const runs: Stroke['points'][] = []
  let run: Stroke['points'] = []
  const flush = () => {
    if (run.length >= 2) runs.push(run)
    run = []
  }
  const effectiveRadius = radius + stroke.style.lineWidth / 2
  if (stroke.points[0]) run.push(stroke.points[0])

  for (let index = 1; index < stroke.points.length; index += 1) {
    const start = stroke.points[index - 1]
    const end = stroke.points[index]
    const startWorld = gridPointToWorldPoint(start, { spacing })
    const endWorld = gridPointToWorldPoint(end, { spacing })

    if (distanceToSegment(worldPoint, startWorld, endWorld) > effectiveRadius) {
      run.push(end)
      continue
    }

    const segmentLength = Math.hypot(endWorld.x - startWorld.x, endWorld.y - startWorld.y)
    const stepSize = Math.max(effectiveRadius * 0.45, spacing * 0.12)
    const steps = Math.max(1, Math.min(5000, Math.ceil(segmentLength / stepSize)))
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps
      const sample = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }
      const world = gridPointToWorldPoint(sample, { spacing })
      if (Math.hypot(world.x - worldPoint.x, world.y - worldPoint.y) <= effectiveRadius) flush()
      else if (!run.length || run.at(-1)?.x !== sample.x || run.at(-1)?.y !== sample.y) run.push(sample)
    }
  }
  flush()
  return runs.map((points, index) => ({ ...stroke, id: `${stroke.id}-segment-${index}-${Date.now()}`, points }))
}

function distanceToSegment(point: WorldPoint, start: WorldPoint, end: WorldPoint) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

function loadLocalSnapshot(): RecoverySnapshot {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return { savedAt: 0, document: createDocument(DEFAULT_GRID_SPACING, DEFAULT_CANVAS_SIZE) }
    const parsed = JSON.parse(stored) as DrawingDocument | RecoverySnapshot
    const snapshot = 'document' in parsed ? parsed : { savedAt: 0, document: parsed }
    if (snapshot.document.version !== 5 || !Array.isArray(snapshot.document.layers) || !snapshot.document.layers.length) throw new Error('Invalid document')
    return { ...snapshot, document: syncDocumentCanvas(snapshot.document, snapshot.document.canvas) }
  } catch {
    return { savedAt: 0, document: createDocument(DEFAULT_GRID_SPACING, DEFAULT_CANVAS_SIZE) }
  }
}

function saveLocalRecoverySnapshot(snapshot: RecoverySnapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // IndexedDB remains the primary recovery store when localStorage is full.
  }
}

const DITHER_PRESETS: Array<{ id: DitherPattern; label: string }> = [
  { id: 'bayer25', label: 'Ordered dither 25%' },
  { id: 'bayer50', label: 'Ordered dither 50%' },
  { id: 'bayer75', label: 'Ordered dither 75%' },
  { id: 'diagonal', label: 'Diagonal lines' },
  { id: 'crosshatch', label: 'Crosshatch' },
  { id: 'stipple', label: 'Stipple' },
]

const TOOL_OPTIONS: Array<{ id: ToolMode; label: string; shortcut: string }> = [
  { id: 'draw', label: 'Grid pen', shortcut: 'B' },
  { id: 'curve', label: 'Curve pen', shortcut: 'C' },
  { id: 'shape', label: 'Shape', shortcut: 'U' },
  { id: 'select', label: 'Select', shortcut: 'M' },
  { id: 'erase', label: 'Eraser', shortcut: 'E' },
  { id: 'bucket', label: 'Fill', shortcut: 'G' },
  { id: 'patternBucket', label: 'Pattern fill', shortcut: 'K' },
  { id: 'picker', label: 'Eyedropper', shortcut: 'I' },
  { id: 'hand', label: 'Hand', shortcut: 'H' },
  { id: 'zoom', label: 'Zoom', shortcut: 'Z' },
]

function ToolIcon({ name }: { name: ToolMode }) {
  const paths: Record<ToolMode, React.ReactNode> = {
    draw: <><path d="m5 19 3.5-.8L19 7.7 16.3 5 5.8 15.5 5 19Z"/><path d="m14.8 6.5 2.7 2.7"/></>,
    curve: <><path d="M5 18c0-7 3-12 9-12h4"/><circle cx="5" cy="18" r="1.5"/><circle cx="18" cy="6" r="1.5"/></>,
    shape: <><rect x="4.5" y="4.5" width="10" height="10" rx=".5"/><circle cx="15.5" cy="15.5" r="4"/></>,
    select: <><rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="3 2"/><path d="m14 13 6 6M14 19l6-6"/></>,
    erase: <><path d="m7 17-3-3 8-9 6 6-6 7H8l-1-1Z"/><path d="m9.5 8 6 6M11 18h8"/></>,
    bucket: <><path d="m5 12 7-7 7 7-7 7-7-7Z"/><path d="M7.5 9.5h9M18.5 16.5s1.5 1.4 1.5 2.3a1.5 1.5 0 0 1-3 0c0-.9 1.5-2.3 1.5-2.3Z"/></>,
    patternBucket: <><path d="m5 11 7-7 7 7-7 7-7-7Z"/><circle cx="8" cy="11" r=".65"/><circle cx="11" cy="14" r=".65"/><circle cx="14" cy="11" r=".65"/><path d="M19 16s1.5 1.4 1.5 2.3a1.5 1.5 0 0 1-3 0C17.5 17.4 19 16 19 16Z"/></>,
    picker: <><path d="m14 5 5 5-9 9H5v-5l9-9Z"/><path d="m12 7 5 5M6 18h4"/></>,
    hand: <path d="M8 11V7a1.5 1.5 0 0 1 3 0v3-5a1.5 1.5 0 0 1 3 0v5-4a1.5 1.5 0 0 1 3 0v6l1-1a1.7 1.7 0 0 1 2.5 2.2l-4.3 5.4A4 4 0 0 1 13 20h-2.5a4 4 0 0 1-3.2-1.6L4 14a1.7 1.7 0 0 1 2.5-2.2L8 13v-2Z"/>,
    zoom: <><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5M10.5 8v5M8 10.5h5"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

const SHAPE_OPTIONS: Array<{ id: ShapeMode; label: string }> = [
  { id: 'square', label: 'Square' },
  { id: 'circle', label: 'Circle' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'triangle', label: 'Triangle' },
]

function ShapePresetIcon({ name }: { name: ShapeMode }) {
  const paths: Record<ShapeMode, React.ReactNode> = {
    square: <rect x="4" y="4" width="16" height="16"/>,
    circle: <circle cx="12" cy="12" r="8"/>,
    diamond: <path d="m12 3 9 9-9 9-9-9 9-9Z"/>,
    triangle: <path d="m12 3 9 17H3L12 3Z"/>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function MiniIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    eye: <><path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z"/><circle cx="12" cy="12" r="2.5"/></>,
    'eye-off': <path d="m4 4 16 16M9.5 7.4A10.4 10.4 0 0 1 12 7c6 0 9.5 5 9.5 5a15 15 0 0 1-2.2 2.5M6.2 8.2C3.8 9.7 2.5 12 2.5 12s3.5 5 9.5 5a9 9 0 0 0 2.8-.4"/>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    unlock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.3-2.2"/></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function IconButton({ label, icon, onClick, disabled }: { label: string; icon: string; onClick: () => void; disabled?: boolean }) {
  const icons: Record<string, React.ReactNode> = {
    undo: <path d="m9 7-5 5 5 5M5 12h8a6 6 0 0 1 6 6"/>, redo: <path d="m15 7 5 5-5 5m4-5h-8a6 6 0 0 0-6 6"/>,
    plus: <path d="M12 5v14M5 12h14"/>, duplicate: <><rect x="8" y="8" width="11" height="11" rx="1"/><path d="M16 8V5H5v11h3"/></>,
    up: <path d="m7 14 5-5 5 5"/>, down: <path d="m7 10 5 5 5-5"/>, trash: <><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></>,
    clear: <><path d="m7 17-3-3 8-9 6 6-6 7H8l-1-1Z"/><path d="M11 18h8"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  }
  return <button type="button" className="icon-button" aria-label={label} title={label} onClick={onClick} disabled={disabled}><svg viewBox="0 0 24 24" aria-hidden="true">{icons[icon]}</svg></button>
}
