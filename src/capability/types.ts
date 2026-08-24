/**
 * dsh-mobile capability types — the core asset of this package.
 *
 * Every execution backend (mock, mobile-mcp, raw ADB, uiautomator2, Appium,
 * cloud devices) implements {@link MobileService} against THESE types. Upper
 * layers (tools, context builders, future communication agents) depend only
 * on this file, never on a provider's wire format.
 *
 * Design rules (see docs/HARNESS_ARCHITECTURE.md):
 * - ScreenState is the ONE observation shape; providers must normalize.
 * - UIElement bounds are physical pixels of the observed screen.
 * - Everything here is lossless-JSON-serializable (no functions, no classes).
 */

/** One attached device. */
export interface DeviceInfo {
  /** Stable provider-side device identifier (e.g. `emulator-5554`). */
  id: string
  /** Device platform. */
  platform: 'android' | 'ios'
  /** Human-readable model/name when known. */
  name?: string
  /** Physical screen resolution in pixels. */
  screen: { width: number; height: number }
}

/** One interactive or informative node on the observed screen. */
export interface UIElement {
  /** Provider-side stable-ish identifier (resource-id / accessibility id). */
  id?: string
  /** Visible text, if any. */
  text?: string
  /** Content description / accessibility label, if any. */
  description?: string
  /** Widget class (e.g. `android.widget.Button`). */
  className?: string
  /** Physical-pixel bounding box on the observed screen. */
  bounds: { left: number; top: number; right: number; bottom: number }
  clickable?: boolean
  editable?: boolean
  scrollable?: boolean
}

/** The normalized observation of a device screen. */
export interface ScreenState {
  deviceId: string
  /** Foreground application, when the provider can tell. */
  app?: {
    packageName: string
    activity?: string
  }
  /** Physical screen resolution in pixels. */
  screen: { width: number; height: number }
  /** Normalized UI tree, flattened. */
  elements: UIElement[]
  /** Optional screenshot reference — a URI the host can fetch, never inline bytes. */
  screenshot?: { uri: string }
  /** Observation time (epoch ms). */
  timestamp: number
}

/**
 * How a tap locates its target. Exactly one variant per call; semantic
 * variants are preferred over raw coordinates (see the operating rules in
 * context/system.ts).
 */
export type TapTarget =
  | { elementId: string }
  | { text: string }
  | { x: number; y: number }

/** A drag between two physical-pixel points. */
export interface SwipeGesture {
  start: { x: number; y: number }
  end: { x: number; y: number }
  durationMs?: number
}

/** Uniform outcome of every mutating capability call. */
export interface ActionResult {
  ok: boolean
  /** One-line, model-readable outcome ("tapped '发送'", "app not found"). */
  summary: string
  /** Root-cause hint when ok is false. */
  error?: string
}
