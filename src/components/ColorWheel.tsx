import { useMemo, useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { hexToHsl, hslToHex } from '../lib/color'

interface ColorWheelProps {
  color: string
  onChange: (color: string) => void
}

export function ColorWheel({ color, onChange }: ColorWheelProps) {
  const wheelRef = useRef<HTMLDivElement | null>(null)
  const hsl = useMemo(() => hexToHsl(color), [color])
  const radians = hsl.hue * Math.PI / 180
  const markerRadius = hsl.saturation * 0.48
  const markerStyle = {
    left: `${50 + Math.cos(radians) * markerRadius}%`,
    top: `${50 + Math.sin(radians) * markerRadius}%`,
  }
  const wheelBackground = 'radial-gradient(circle, hsl(0 0% 50%) 0%, hsl(0 0% 50% / 0) 72%), conic-gradient(from 90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = wheelRef.current?.getBoundingClientRect()
    if (!bounds) return
    const deltaX = event.clientX - (bounds.left + bounds.width / 2)
    const deltaY = event.clientY - (bounds.top + bounds.height / 2)
    const hue = (Math.atan2(deltaY, deltaX) * 180 / Math.PI + 360) % 360
    const saturation = Math.min(100, Math.hypot(deltaX, deltaY) / (Math.min(bounds.width, bounds.height) / 2) * 100)
    onChange(hslToHex({ hue, saturation, lightness: hsl.lightness }))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const hueDelta = event.key === 'ArrowLeft' ? -2 : event.key === 'ArrowRight' ? 2 : 0
    const saturationDelta = event.key === 'ArrowDown' ? -2 : event.key === 'ArrowUp' ? 2 : 0
    if (!hueDelta && !saturationDelta) return
    event.preventDefault()
    onChange(hslToHex({
      hue: hsl.hue + hueDelta,
      saturation: hsl.saturation + saturationDelta,
      lightness: hsl.lightness,
    }))
  }

  return (
    <div className="color-wheel-control">
      <div
        ref={wheelRef}
        className="color-wheel"
        role="slider"
        tabIndex={0}
        aria-label="Color hue and saturation"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsl.hue)}
        aria-valuetext={`${Math.round(hsl.hue)}° hue, ${Math.round(hsl.saturation)}% saturation`}
        style={{ background: wheelBackground }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          updateFromPointer(event)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event)
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        onPointerCancel={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
        onKeyDown={handleKeyDown}
      >
        <span className="color-wheel-marker" style={markerStyle} />
      </div>
      <label className="lightness-control">
        <span>Lightness</span>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(hsl.lightness)}
          aria-label="Color lightness"
          style={{ background: `linear-gradient(to right, #000, hsl(${hsl.hue} 100% 50%), #fff)` }}
          onChange={(event) => onChange(hslToHex({ ...hsl, lightness: Number(event.target.value) }))}
        />
        <output>{Math.round(hsl.lightness)}%</output>
      </label>
      <div className="color-readout">
        <input type="color" aria-label="Exact color picker" value={color} onChange={(event) => onChange(event.target.value)} />
        <code>{color.toUpperCase()}</code>
      </div>
    </div>
  )
}
