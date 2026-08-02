import { normalizeHexColor } from './color'

export interface UserPreferences {
  canvasBackgroundColor: string
  gridDotColor: string
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  canvasBackgroundColor: '#ffffff',
  gridDotColor: '#68707a',
}

const PREFERENCES_KEY = 'lines-on-grids-preferences-v1'

export function loadPreferences(): UserPreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? '{}') as Partial<UserPreferences>
    return {
      canvasBackgroundColor: typeof parsed.canvasBackgroundColor === 'string'
        ? normalizeHexColor(parsed.canvasBackgroundColor) ?? DEFAULT_PREFERENCES.canvasBackgroundColor
        : DEFAULT_PREFERENCES.canvasBackgroundColor,
      gridDotColor: typeof parsed.gridDotColor === 'string'
        ? normalizeHexColor(parsed.gridDotColor) ?? DEFAULT_PREFERENCES.gridDotColor
        : DEFAULT_PREFERENCES.gridDotColor,
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function savePreferences(preferences: UserPreferences) {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences))
  } catch {
    // Preferences are non-critical when browser storage is unavailable.
  }
}
