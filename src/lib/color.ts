export interface HslColor {
  hue: number
  saturation: number
  lightness: number
}

export function normalizeHexColor(color: string) {
  const normalized = color.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized
  if (!/^#[0-9a-f]{3}$/.test(normalized)) return null
  return `#${normalized.slice(1).split('').map((channel) => channel.repeat(2)).join('')}`
}

export function hexToHsl(color: string): HslColor {
  const normalized = normalizeHexColor(color) ?? '#000000'
  const red = Number.parseInt(normalized.slice(1, 3), 16) / 255
  const green = Number.parseInt(normalized.slice(3, 5), 16) / 255
  const blue = Number.parseInt(normalized.slice(5, 7), 16) / 255
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  const delta = maximum - minimum
  const lightness = (maximum + minimum) / 2
  let hue = 0

  if (delta > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6)
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2)
    else hue = 60 * ((red - green) / delta + 4)
  }

  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
  return {
    hue: (hue + 360) % 360,
    saturation: saturation * 100,
    lightness: lightness * 100,
  }
}

export function hslToHex({ hue, saturation, lightness }: HslColor) {
  const normalizedHue = ((hue % 360) + 360) % 360
  const normalizedSaturation = clamp(saturation, 0, 100) / 100
  const normalizedLightness = clamp(lightness, 0, 100) / 100
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation
  const hueSection = normalizedHue / 60
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1))
  const match = normalizedLightness - chroma / 2
  const [red, green, blue] = hueSection < 1 ? [chroma, secondary, 0]
    : hueSection < 2 ? [secondary, chroma, 0]
      : hueSection < 3 ? [0, chroma, secondary]
        : hueSection < 4 ? [0, secondary, chroma]
          : hueSection < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary]

  return `#${[red, green, blue]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
    .join('')}`
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}
