/**
 * The MobileService capability seam — service DEFINITION.
 *
 * Seam layout (docs/HARNESS_ARCHITECTURE.md):
 *
 *   MobileService          <- this definition (the contract)
 *       |
 *   Mock / Mcp Provider    <- providers/ (execution backends)
 *       |
 *   mobile_* tools         <- tools/ (model-facing consumers)
 *
 * The service is provided on the Cordis context as `ctx.mobile` by the plugin
 * entry (src/index.ts). Consumers must resolve it per call with
 * `ctx.get('mobile')` so a provider swap is picked up without re-registration.
 */

import type {
  ActionResult,
  DeviceInfo,
  ScreenState,
  SwipeGesture,
  TapTarget,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The mobile device capability, provided by dsh-mobile. */
    mobile: MobileService
  }
}

/**
 * Normalized control surface over one or more mobile devices.
 *
 * All methods are async and must never throw for EXPECTED environmental
 * failures (no device, app missing, element not found): those are returned as
 * `ActionResult { ok: false }` — or, for observations, as a thrown
 * `MobileError` with a machine-readable `code`, so tool consumers can render
 * a recovery hint instead of a stack.
 */
export interface MobileService {
  /** Provider identifier ('mock', 'mobile-mcp', ...). */
  readonly providerName: string

  /** List currently attached devices. */
  getDevices(): Promise<DeviceInfo[]>

  /** Observe the current screen. The ONE way agents see the device. */
  observe(deviceId?: string): Promise<ScreenState>

  /** Launch an application by package name or provider-known alias. */
  openApp(app: string, deviceId?: string): Promise<ActionResult>

  /** Tap a semantic target or raw coordinates. */
  tap(target: TapTarget, deviceId?: string): Promise<ActionResult>

  /**
   * Enter text into the focused (or targeted) editable element.
   * This NEVER submits: sending is a separate, higher-tier capability.
   */
  type(text: string, deviceId?: string): Promise<ActionResult>

  /** Perform a swipe gesture. */
  swipe(gesture: SwipeGesture, deviceId?: string): Promise<ActionResult>

  /** Navigate back. */
  back(deviceId?: string): Promise<ActionResult>

  /**
   * Release provider-owned resources (MCP connections, spawned servers).
   * Optional: stateless providers may omit it. Called on plugin unload.
   */
  dispose?(): Promise<void>
}

/** Expected, recoverable capability failure with a routable code. */
export class MobileError extends Error {
  constructor(
    readonly code:
      | 'NO_DEVICE'
      | 'DEVICE_NOT_FOUND'
      | 'APP_NOT_FOUND'
      | 'ELEMENT_NOT_FOUND'
      | 'NOT_EDITABLE'
      | 'PROVIDER_UNAVAILABLE'
      | 'NOT_IMPLEMENTED',
    message: string,
  ) {
    super(message)
    this.name = 'MobileError'
  }
}
