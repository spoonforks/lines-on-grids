export interface GridPoint {
  x: number
  y: number
}

export type BrushMode = 'auto' | 'curve'
export type DitherPattern = 'bayer25' | 'bayer50' | 'bayer75' | 'diagonal' | 'crosshatch' | 'stipple'
export type ShapeMode = 'square' | 'circle' | 'diamond' | 'triangle'
export type ToolMode = 'draw' | 'curve' | 'shape' | 'erase' | 'bucket' | 'patternBucket' | 'picker' | 'hand' | 'zoom'

export interface WorldPoint {
  x: number
  y: number
}

export interface CanvasSize {
  width: number
  height: number
}

export interface GridSettings {
  spacing: number
}

export interface StrokeStyle {
  color: string
  lineWidth: number
}

export interface Stroke {
  id: string
  layerId: string
  points: GridPoint[]
  style: StrokeStyle
  brush: BrushMode
}

export interface StrokeDraft {
  points: GridPoint[]
  style: StrokeStyle
  brush: BrushMode
}

export interface FillRegion {
  id: string
  layerId: string
  color: string
  seed: WorldPoint
  pattern?: DitherPattern
  extendsToCanvasEdge?: boolean
}

export interface DrawingLayer {
  id: string
  name: string
  visible: boolean
  locked: boolean
  opacity: number
}

export interface DrawingDocument {
  version: 5
  grid: GridSettings
  canvas: CanvasSize
  backgroundColor: string
  layers: DrawingLayer[]
  activeLayerId: string
  strokes: Stroke[]
  fills: FillRegion[]
}

export interface ToolState {
  selectedTool: ToolMode
  color: string
  lineWidth: number
  pattern: DitherPattern
  shape: ShapeMode
  shapeSize: number
  mirrorX: boolean
  mirrorY: boolean
  activeStroke: StrokeDraft | null
  hoverPoint: GridPoint | null
  hoveredStrokeId: string | null
}

export interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
}

export interface GridMetrics {
  spacing: number
}

export interface ViewportState {
  x: number
  y: number
  zoom: number
}
