import {
  appendSegmentPoints,
  getMirroredPointSets,
  getVisibleGridBounds,
  gridPointToWorldPoint,
  screenPointToWorldPoint,
  worldPointToScreenPoint,
} from './grid'
import type {
  CanvasSize,
  DitherPattern,
  DrawingDocument,
  GridMetrics,
  GridPoint,
  Stroke,
  StrokeDraft,
  ViewportState,
  WorldPoint,
} from '../types'

const GRID_DOT_RADIUS = 1.5
const HOVER_DOT_RADIUS = 4.8
const ACTIVE_DOT_RADIUS = 3.2
const DEFAULT_GRID_DOT_COLOR = '#68707a'
const PREVIEW_COLOR = 'rgba(95, 108, 175, 0.56)'
const ERASE_PREVIEW_COLOR = 'rgba(201, 120, 92, 0.44)'
const PICKER_PREVIEW_COLOR = 'rgba(95, 108, 175, 0.24)'
const STROKE_MASK_COLOR = '#111111'
const strokeBoundsCache = new WeakMap<Stroke, { minX: number; minY: number; maxX: number; maxY: number }>()

export function configureCanvas(canvas: HTMLCanvasElement, size: CanvasSize) {
  const devicePixelRatio = window.devicePixelRatio || 1
  const pixelWidth = Math.round(size.width * devicePixelRatio)
  const pixelHeight = Math.round(size.height * devicePixelRatio)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
  }

  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Unable to create a 2D canvas context.')
  }

  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
  context.clearRect(0, 0, size.width, size.height)

  return context
}

export function drawGridLayer(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  metrics: GridMetrics,
  viewport: ViewportState,
  isVisible = true,
  dotColor = DEFAULT_GRID_DOT_COLOR,
) {
  context.clearRect(0, 0, size.width, size.height)

  if (!isVisible) {
    return
  }

  context.save()
  context.fillStyle = dotColor
  context.globalAlpha = 0.2

  const bounds = getVisibleGridBounds(size, viewport, metrics)

  const step = Math.max(1, Math.ceil(6 / (metrics.spacing * viewport.zoom)))
  const startY = Math.floor(bounds.minY / step) * step
  const startX = Math.floor(bounds.minX / step) * step
  for (let y = startY; y <= bounds.maxY; y += step) {
    for (let x = startX; x <= bounds.maxX; x += step) {
      const screenPoint = worldPointToScreenPoint(
        gridPointToWorldPoint({ x, y }, metrics),
        size,
        viewport,
      )
      drawCircle(context, screenPoint, GRID_DOT_RADIUS)
    }
  }
  context.restore()
}

export function drawDrawingSurface(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  metrics: GridMetrics,
  viewport: ViewportState,
  documentState: DrawingDocument,
) {
  context.clearRect(0, 0, size.width, size.height)
  const raster = createSceneRaster(size, metrics, viewport, documentState)
  context.drawImage(raster.canvas, 0, 0)
}

export function drawOverlay(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  metrics: GridMetrics,
  viewport: ViewportState,
  options: {
    activeStroke: StrokeDraft | null
    hoverPoint: GridPoint | null
    hoveredStroke: Stroke | null
    pickerPoint: WorldPoint | null
    shapePreview: StrokeDraft | null
    preferDiagonalPreview: boolean
    mirrorX: boolean
    mirrorY: boolean
  },
) {
  context.clearRect(0, 0, size.width, size.height)

  if (options.hoveredStroke) {
    drawStroke(context, size, metrics, viewport, options.hoveredStroke, {
      colorOverride: ERASE_PREVIEW_COLOR,
      lineWidthOffset: 6,
    })
  }

  if (options.activeStroke) {
    const lastPoint = options.activeStroke.points.at(-1)
    if (options.hoverPoint && lastPoint) {
      const previewPoints = appendSegmentPoints([lastPoint], options.hoverPoint, options.activeStroke.brush, options.preferDiagonalPreview)
      const previewPointSets = getMirroredPointSets(previewPoints, options.mirrorX, options.mirrorY)
      for (let index = 0; index < previewPointSets.length; index += 1) {
        drawStroke(context, size, metrics, viewport, {
          id: `preview-${index}`,
          layerId: 'active',
          points: previewPointSets[index],
          style: options.activeStroke.style,
          brush: options.activeStroke.brush,
        }, { colorOverride: PREVIEW_COLOR, dashed: true })
      }
    }
  }

  if (options.shapePreview) {
    const previewPointSets = getMirroredPointSets(options.shapePreview.points, options.mirrorX, options.mirrorY)
    for (let index = 0; index < previewPointSets.length; index += 1) {
      drawStroke(context, size, metrics, viewport, {
        id: `shape-preview-${index}`,
        layerId: 'active',
        points: previewPointSets[index],
        style: options.shapePreview.style,
        brush: 'auto',
      }, { colorOverride: PREVIEW_COLOR, dashed: true, skipCulling: true })
    }
  }

  if (options.hoverPoint) {
    const hoverPointSets = getMirroredPointSets([options.hoverPoint], options.mirrorX, options.mirrorY)
    for (const [hoverPoint] of hoverPointSets) {
      context.fillStyle = PREVIEW_COLOR
      drawCircle(context, worldPointToScreenPoint(gridPointToWorldPoint(hoverPoint, metrics), size, viewport), HOVER_DOT_RADIUS)
    }
  }

  if (options.pickerPoint) {
    const pickerPoint = worldPointToScreenPoint(options.pickerPoint, size, viewport)
    context.fillStyle = PICKER_PREVIEW_COLOR
    drawCircle(context, pickerPoint, HOVER_DOT_RADIUS + 2)
  }
}

export function drawActiveStrokeLayer(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  metrics: GridMetrics,
  viewport: ViewportState,
  activeStroke: StrokeDraft | null,
  mirrorX: boolean,
  mirrorY: boolean,
) {
  context.clearRect(0, 0, size.width, size.height)

  if (mirrorX || mirrorY) drawSymmetryGuides(context, size, viewport, mirrorX, mirrorY)
  if (!activeStroke) return

  const mirrorScales = getMirrorScales(mirrorX, mirrorY)
  for (let index = 0; index < mirrorScales.length; index += 1) {
    const scale = mirrorScales[index]
    drawStroke(context, size, metrics, viewport, {
      id: `active-${index}`,
      layerId: 'active',
      points: activeStroke.points,
      style: activeStroke.style,
      brush: activeStroke.brush,
    }, { scaleX: scale.x, scaleY: scale.y, skipCulling: true })

    const lastPoint = activeStroke.points.at(-1)
    if (!lastPoint) continue
    const mirroredLastPoint = { x: lastPoint.x * scale.x, y: lastPoint.y * scale.y }
    context.fillStyle = activeStroke.style.color
    drawCircle(
      context,
      worldPointToScreenPoint(gridPointToWorldPoint(mirroredLastPoint, metrics), size, viewport),
      ACTIVE_DOT_RADIUS,
    )
  }
}

export function renderExportedDrawing(
  context: CanvasRenderingContext2D,
  canvasSize: CanvasSize,
  metrics: GridMetrics,
  viewport: ViewportState,
  documentState: DrawingDocument,
) {
  const raster = createSceneRaster(canvasSize, metrics, viewport, documentState)
  context.drawImage(raster.canvas, 0, 0)
}

export function findStrokeAtCanvasPoint(
  strokes: Stroke[],
  metrics: GridMetrics,
  canvas: CanvasSize,
  viewport: ViewportState,
  point: { x: number; y: number },
) {
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const stroke = strokes[index]
    const threshold = Math.max(8, stroke.style.lineWidth * viewport.zoom * 0.5 + 6)
    const worldPoint = screenPointToWorldPoint(point.x, point.y, canvas, viewport)
    const thresholdWorld = threshold / viewport.zoom
    const bounds = getStrokeWorldBounds(stroke, metrics)
    if (
      worldPoint.x < bounds.minX - thresholdWorld ||
      worldPoint.x > bounds.maxX + thresholdWorld ||
      worldPoint.y < bounds.minY - thresholdWorld ||
      worldPoint.y > bounds.maxY + thresholdWorld
    ) continue

    for (let pathIndex = 1; pathIndex < stroke.points.length; pathIndex += 1) {
      const start = worldPointToScreenPoint(
        gridPointToWorldPoint(stroke.points[pathIndex - 1], metrics), canvas, viewport,
      )
      const end = worldPointToScreenPoint(
        gridPointToWorldPoint(stroke.points[pathIndex], metrics), canvas, viewport,
      )
      if (distanceToSegment(point, start, end) <= threshold) {
        return stroke
      }
    }
  }

  return null
}

export function sampleSceneColorAtCanvasPoint(
  documentState: DrawingDocument,
  metrics: GridMetrics,
  canvas: CanvasSize,
  viewport: ViewportState,
  point: { x: number; y: number },
) {
  const raster = createSceneRaster(canvas, metrics, viewport, documentState)
  const pixel = raster.context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data

  if (pixel[3] === 0) {
    return null
  }

  return rgbToHex(pixel[0], pixel[1], pixel[2])
}

export function resolveBucketActionAtCanvasPoint(
  documentState: DrawingDocument,
  metrics: GridMetrics,
  size: CanvasSize,
  viewport: ViewportState,
  point: { x: number; y: number },
) {
  const activeLayer = documentState.layers.find((layer) => layer.id === documentState.activeLayerId)
  const activeStrokes = activeLayer?.visible
    ? documentState.strokes.filter((stroke) => stroke.layerId === activeLayer.id)
    : []
  const strokeMask = createStrokeMaskRaster(size, metrics, viewport, activeStrokes)
  const roundedX = Math.round(point.x)
  const roundedY = Math.round(point.y)

  if (!isPointInsideCanvas(size, roundedX, roundedY)) {
    return 'stroke' as const
  }

  const strokePixel = strokeMask.context.getImageData(roundedX, roundedY, 1, 1).data

  if (strokePixel[3] > 0) {
    return 'stroke' as const
  }

  const raster = createRasterContext(size)
  for (const stroke of activeStrokes) {
    drawStroke(raster.context, size, metrics, viewport, stroke)
  }
  const region = getFloodFillRegion(
    raster.context.getImageData(0, 0, size.width, size.height),
    roundedX,
    roundedY,
  )

  if (!region) {
    return 'stroke' as const
  }

  return region.touchesBoundary ? ('background' as const) : ('fill' as const)
}

function drawStroke(
  context: CanvasRenderingContext2D,
  canvas: CanvasSize,
  metrics: GridMetrics,
  viewport: ViewportState,
  stroke: Stroke,
  options?: {
    colorOverride?: string
    dashed?: boolean
    lineWidthOffset?: number
    scaleX?: number
    scaleY?: number
    skipCulling?: boolean
  },
) {
  if (stroke.points.length === 0) {
    return
  }

  if (!options?.skipCulling) {
    const bounds = getStrokeWorldBounds(stroke, metrics)
    const padding = (stroke.style.lineWidth + 8) / viewport.zoom
    const viewLeft = viewport.x - canvas.width / (2 * viewport.zoom)
    const viewRight = viewport.x + canvas.width / (2 * viewport.zoom)
    const viewTop = viewport.y - canvas.height / (2 * viewport.zoom)
    const viewBottom = viewport.y + canvas.height / (2 * viewport.zoom)
    if (bounds.maxX < viewLeft - padding || bounds.minX > viewRight + padding || bounds.maxY < viewTop - padding || bounds.minY > viewBottom + padding) return
  }

  const scaleX = options?.scaleX ?? 1
  const scaleY = options?.scaleY ?? 1
  const transformPoint = (point: GridPoint) => ({ x: point.x * scaleX, y: point.y * scaleY })

  const firstPoint = worldPointToScreenPoint(
    gridPointToWorldPoint(transformPoint(stroke.points[0]), metrics), canvas, viewport,
  )
  context.save()
  context.strokeStyle = options?.colorOverride ?? stroke.style.color
  context.fillStyle = options?.colorOverride ?? stroke.style.color
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = Math.max(1, stroke.style.lineWidth * viewport.zoom + (options?.lineWidthOffset ?? 0))
  context.setLineDash(options?.dashed ? [8, 6] : [])
  context.beginPath()
  context.moveTo(firstPoint.x, firstPoint.y)

  for (let index = 1; index < stroke.points.length; index += 1) {
    const point = worldPointToScreenPoint(
      gridPointToWorldPoint(transformPoint(stroke.points[index]), metrics), canvas, viewport,
    )
    context.lineTo(point.x, point.y)
  }

  context.stroke()
  context.restore()
}

function createSceneRaster(
  size: CanvasSize,
  metrics: GridMetrics,
  viewport: ViewportState,
  documentState: DrawingDocument,
) {
  const raster = createRasterContext(size)
  raster.context.clearRect(0, 0, size.width, size.height)
  raster.context.fillStyle = documentState.backgroundColor
  raster.context.fillRect(0, 0, size.width, size.height)

  const strokesByLayer = new Map<string, Stroke[]>()
  const fillsByLayer = new Map<string, DrawingDocument['fills']>()
  for (const stroke of documentState.strokes) {
    const strokes = strokesByLayer.get(stroke.layerId)
    if (strokes) strokes.push(stroke)
    else strokesByLayer.set(stroke.layerId, [stroke])
  }
  for (const fill of documentState.fills) {
    const fills = fillsByLayer.get(fill.layerId)
    if (fills) fills.push(fill)
    else fillsByLayer.set(fill.layerId, [fill])
  }

  for (const layer of documentState.layers) {
    if (!layer.visible || layer.opacity <= 0) {
      continue
    }

    const strokes = strokesByLayer.get(layer.id) ?? []
    const fills = fillsByLayer.get(layer.id) ?? []

    if (fills.length === 0 && layer.opacity === 1) {
      for (const stroke of strokes) drawStroke(raster.context, size, metrics, viewport, stroke)
      continue
    }

    const layerRaster = createRasterContext(size)

    for (const stroke of strokes) {
      drawStroke(layerRaster.context, size, metrics, viewport, stroke)
    }

    for (const fill of fills) {
      const seedPoint = worldPointToScreenPoint(fill.seed, size, viewport)
      const seedOutsideCanvas = seedPoint.x < 0 || seedPoint.x >= size.width || seedPoint.y < 0 || seedPoint.y >= size.height
      const seedX = fill.extendsToCanvasEdge && seedOutsideCanvas ? 0 : Math.round(seedPoint.x)
      const seedY = fill.extendsToCanvasEdge && seedOutsideCanvas ? 0 : Math.round(seedPoint.y)
      applyFloodFill(
        layerRaster.context,
        seedX,
        seedY,
        hexToRgba(fill.color),
        fill.pattern,
        size,
        viewport,
      )
    }

    for (const stroke of strokes) {
      drawStroke(layerRaster.context, size, metrics, viewport, stroke)
    }

    raster.context.save()
    raster.context.globalAlpha = layer.opacity
    raster.context.drawImage(layerRaster.canvas, 0, 0)
    raster.context.restore()
  }

  return raster
}

function createStrokeMaskRaster(
  size: CanvasSize,
  metrics: GridMetrics,
  viewport: ViewportState,
  strokes: Stroke[],
) {
  const raster = createRasterContext(size)
  raster.context.clearRect(0, 0, size.width, size.height)

  for (const stroke of strokes) {
    drawStroke(raster.context, size, metrics, viewport, {
      ...stroke,
      style: {
        ...stroke.style,
        color: STROKE_MASK_COLOR,
      },
    })
  }

  return raster
}

function createRasterContext(size: CanvasSize) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, size.width)
  canvas.height = Math.max(1, size.height)
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Unable to create a 2D canvas context.')
  }

  return { canvas, context }
}

function applyFloodFill(
  context: CanvasRenderingContext2D,
  seedX: number,
  seedY: number,
  fillColor: [number, number, number, number],
  pattern?: DitherPattern,
  size?: CanvasSize,
  viewport?: ViewportState,
) {
  if (!isPointInsideCanvas({ width: context.canvas.width, height: context.canvas.height }, seedX, seedY)) {
    return null
  }

  const imageData = context.getImageData(0, 0, context.canvas.width, context.canvas.height)
  const region = getFloodFillRegion(imageData, seedX, seedY)

  if (!region) {
    return null
  }

  const edgePixelIndexes = pattern ? [] : getAdjacentAntialiasedPixelIndexes(imageData, region.pixelIndexes)

  for (const pixelIndex of region.pixelIndexes) {
    let shouldPaint = true

    if (pattern && size && viewport) {
      const pixelNumber = pixelIndex / 4
      const x = pixelNumber % imageData.width
      const y = Math.floor(pixelNumber / imageData.width)
      const worldX = viewport.x + (x - size.width / 2) / viewport.zoom
      const worldY = viewport.y + (y - size.height / 2) / viewport.zoom
      shouldPaint = isDitherPixelVisible(pattern, worldX, worldY)
    }

    imageData.data[pixelIndex] = shouldPaint ? fillColor[0] : 0
    imageData.data[pixelIndex + 1] = shouldPaint ? fillColor[1] : 0
    imageData.data[pixelIndex + 2] = shouldPaint ? fillColor[2] : 0
    imageData.data[pixelIndex + 3] = shouldPaint ? fillColor[3] : 0
  }

  for (const pixelIndex of edgePixelIndexes) {
    imageData.data[pixelIndex] = fillColor[0]
    imageData.data[pixelIndex + 1] = fillColor[1]
    imageData.data[pixelIndex + 2] = fillColor[2]
    imageData.data[pixelIndex + 3] = fillColor[3]
  }

  context.putImageData(imageData, 0, 0)

  return region
}

export function getAdjacentAntialiasedPixelIndexes(imageData: ImageData, regionPixelIndexes: Int32Array) {
  const { width, height, data } = imageData
  const visited = new Uint8Array(width * height)
  const pixelIndexes: number[] = []
  let frontier: number[] = []

  for (const regionPixelIndex of regionPixelIndexes) {
    const pixelNumber = regionPixelIndex / 4
    visited[pixelNumber] = 1
  }

  // Canvas antialiasing can span more than one pixel at curved intersections.
  // Walk the connected translucent band so the fill sits beneath every edge
  // pixel, then redraw the original stroke over it.
  const collectTranslucentNeighbors = (pixelNumber: number, target: number[]) => {
    const centerX = pixelNumber % width
    const centerY = Math.floor(pixelNumber / width)
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      const y = centerY + offsetY
      if (y < 0 || y >= height) continue
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue
        const x = centerX + offsetX
        if (x < 0 || x >= width) continue
        const neighborNumber = y * width + x
        if (visited[neighborNumber]) continue
        visited[neighborNumber] = 1
        const neighborIndex = neighborNumber * 4
        const alpha = data[neighborIndex + 3]
        if (alpha === 0 || alpha === 255) continue
        pixelIndexes.push(neighborIndex)
        target.push(neighborNumber)
      }
    }
  }

  for (const regionPixelIndex of regionPixelIndexes) collectTranslucentNeighbors(regionPixelIndex / 4, frontier)

  for (let depth = 1; depth < 4 && frontier.length > 0; depth += 1) {
    const nextFrontier: number[] = []
    for (const pixelNumber of frontier) collectTranslucentNeighbors(pixelNumber, nextFrontier)
    frontier = nextFrontier
  }

  return pixelIndexes
}

const BAYER_4X4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
]

export function isDitherPixelVisible(pattern: DitherPattern, worldX: number, worldY: number) {
  const cellSize = 3
  const x = Math.floor(worldX / cellSize)
  const y = Math.floor(worldY / cellSize)
  const wrappedX = ((x % 4) + 4) % 4
  const wrappedY = ((y % 4) + 4) % 4

  if (pattern.startsWith('bayer')) {
    const threshold = pattern === 'bayer25' ? 4 : pattern === 'bayer50' ? 8 : 12
    return BAYER_4X4[wrappedY * 4 + wrappedX] < threshold
  }

  if (pattern === 'diagonal') return ((x + y) % 5 + 5) % 5 === 0
  if (pattern === 'crosshatch') {
    return ((x + y) % 7 + 7) % 7 === 0 || ((x - y) % 7 + 7) % 7 === 0
  }

  const hash = (Math.imul(x, 73_856_093) ^ Math.imul(y, 19_349_663)) >>> 0
  return hash % 100 < 34
}

export function getFloodFillRegion(imageData: ImageData, seedX: number, seedY: number) {
  const { width, height, data } = imageData

  if (!isPointInsideCanvas({ width, height }, seedX, seedY)) {
    return null
  }

  const targetIndex = getPixelIndex(width, seedX, seedY)
  const targetColor: [number, number, number, number] = [
    data[targetIndex],
    data[targetIndex + 1],
    data[targetIndex + 2],
    data[targetIndex + 3],
  ]
  const pixelCount = width * height
  const visited = new Uint8Array(pixelCount)
  const queue = new Int32Array(pixelCount)
  const pixelIndexes = new Int32Array(pixelCount)
  let queueHead = 0
  let queueLength = 1
  let regionLength = 0
  queue[0] = targetIndex
  visited[targetIndex / 4] = 1
  let touchesBoundary = false

  while (queueHead < queueLength) {
    const currentIndex = queue[queueHead]
    queueHead += 1

    const pixelNumber = currentIndex / 4

    if (!matchesColor(data, currentIndex, targetColor)) {
      continue
    }

    pixelIndexes[regionLength] = currentIndex
    regionLength += 1

    const x = pixelNumber % width
    const y = Math.floor(pixelNumber / width)

    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
      touchesBoundary = true
    }

    if (x > 0 && !visited[pixelNumber - 1]) {
      visited[pixelNumber - 1] = 1
      queue[queueLength++] = currentIndex - 4
    }
    if (x < width - 1 && !visited[pixelNumber + 1]) {
      visited[pixelNumber + 1] = 1
      queue[queueLength++] = currentIndex + 4
    }
    if (y > 0 && !visited[pixelNumber - width]) {
      visited[pixelNumber - width] = 1
      queue[queueLength++] = currentIndex - width * 4
    }
    if (y < height - 1 && !visited[pixelNumber + width]) {
      visited[pixelNumber + width] = 1
      queue[queueLength++] = currentIndex + width * 4
    }
  }

  return {
    pixelIndexes: pixelIndexes.subarray(0, regionLength),
    touchesBoundary,
    targetColor,
  }
}

function drawCircle(
  context: CanvasRenderingContext2D,
  point: { x: number; y: number },
  radius: number,
) {
  context.beginPath()
  context.arc(point.x, point.y, radius, 0, Math.PI * 2)
  context.fill()
}

function drawSymmetryGuides(
  context: CanvasRenderingContext2D,
  size: CanvasSize,
  viewport: ViewportState,
  mirrorX: boolean,
  mirrorY: boolean,
) {
  const origin = worldPointToScreenPoint({ x: 0, y: 0 }, size, viewport)
  context.save()
  context.strokeStyle = 'rgba(67, 135, 244, 0.65)'
  context.lineWidth = 1
  context.setLineDash([5, 5])
  context.beginPath()
  if (mirrorX && origin.x >= 0 && origin.x <= size.width) {
    context.moveTo(origin.x + 0.5, 0)
    context.lineTo(origin.x + 0.5, size.height)
  }
  if (mirrorY && origin.y >= 0 && origin.y <= size.height) {
    context.moveTo(0, origin.y + 0.5)
    context.lineTo(size.width, origin.y + 0.5)
  }
  context.stroke()
  context.restore()
}

function getMirrorScales(mirrorX: boolean, mirrorY: boolean) {
  const scales = [{ x: 1, y: 1 }]
  if (mirrorX) scales.push({ x: -1, y: 1 })
  if (mirrorY) scales.push({ x: 1, y: -1 })
  if (mirrorX && mirrorY) scales.push({ x: -1, y: -1 })
  return scales
}

function getStrokeWorldBounds(stroke: Stroke, metrics: GridMetrics) {
  const cached = strokeBoundsCache.get(stroke)
  if (cached) return cached

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of stroke.points) {
    const world = gridPointToWorldPoint(point, metrics)
    minX = Math.min(minX, world.x)
    minY = Math.min(minY, world.y)
    maxX = Math.max(maxX, world.x)
    maxY = Math.max(maxY, world.y)
  }
  const bounds = { minX, minY, maxX, maxY }
  strokeBoundsCache.set(stroke, bounds)
  return bounds
}

function distanceToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const lengthSquared = deltaX * deltaX + deltaY * deltaY

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }

  const projection =
    ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) / lengthSquared
  const clampedProjection = Math.max(0, Math.min(1, projection))
  const projectedPoint = {
    x: start.x + clampedProjection * deltaX,
    y: start.y + clampedProjection * deltaY,
  }

  return Math.hypot(point.x - projectedPoint.x, point.y - projectedPoint.y)
}

function hexToRgba(color: string): [number, number, number, number] {
  const normalized = color.replace('#', '')
  const value = normalized.length === 3
    ? normalized
        .split('')
        .map((channel) => `${channel}${channel}`)
        .join('')
    : normalized

  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    255,
  ]
}

function matchesColor(
  data: Uint8ClampedArray,
  pixelIndex: number,
  targetColor: [number, number, number, number],
) {
  return (
    data[pixelIndex] === targetColor[0] &&
    data[pixelIndex + 1] === targetColor[1] &&
    data[pixelIndex + 2] === targetColor[2] &&
    data[pixelIndex + 3] === targetColor[3]
  )
}

function getPixelIndex(width: number, x: number, y: number) {
  return (y * width + x) * 4
}

function isPointInsideCanvas(size: CanvasSize, x: number, y: number) {
  return x >= 0 && y >= 0 && x < size.width && y < size.height
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`
}
