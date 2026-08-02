import { DEFAULT_PREFERENCES } from '../lib/preferences'
import type { UserPreferences } from '../lib/preferences'

interface SettingsDialogProps {
  isOpen: boolean
  preferences: UserPreferences
  canvasBackgroundColor: string
  onBackgroundColorChange: (color: string) => void
  onPreferencesChange: (preferences: UserPreferences) => void
  onClose: () => void
}

export function SettingsDialog({
  isOpen,
  preferences,
  canvasBackgroundColor,
  onBackgroundColorChange,
  onPreferencesChange,
  onClose,
}: SettingsDialogProps) {
  if (!isOpen) return null

  return (
    <div className="dialog-backdrop" role="presentation">
      <div className="dialog-card settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title">Settings</h2>
        <p>Customize the drawing surface. These preferences are saved in this browser.</p>
        <div className="settings-fields">
          <label>
            <span><strong>Canvas background</strong><small>Included in PNG and SVG exports</small></span>
            <input aria-label="Canvas background color" type="color" value={canvasBackgroundColor} onChange={(event) => {
              onBackgroundColorChange(event.target.value)
              onPreferencesChange({ ...preferences, canvasBackgroundColor: event.target.value })
            }} />
          </label>
          <label>
            <span><strong>Grid dots</strong><small>Display preference only</small></span>
            <input aria-label="Grid dot color" type="color" value={preferences.gridDotColor} onChange={(event) => onPreferencesChange({ ...preferences, gridDotColor: event.target.value })} />
          </label>
        </div>
        <div className="dialog-actions split-actions">
          <button type="button" onClick={() => {
            onBackgroundColorChange(DEFAULT_PREFERENCES.canvasBackgroundColor)
            onPreferencesChange({ ...DEFAULT_PREFERENCES })
          }}>Reset defaults</button>
          <button type="button" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
