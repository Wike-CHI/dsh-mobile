/**
 * MobileMcpProvider — real-device EXECUTION PLANE over the mobile-mcp server.
 *
 * Adapts the MCP tool surface of mobile-mcp (vendored at
 * ../framework/mobile-mcp, spawned as a stdio server) to the MobileService
 * contract:
 *
 *   mobile-mcp tool                         MobileService method
 *   ------------------------------------    --------------------
 *   mobile_list_available_devices        -> getDevices()
 *   mobile_get_screen_size +
 *   mobile_list_elements_on_screen       -> observe()
 *   mobile_launch_app                    -> openApp()
 *   mobile_click_on_screen_at_coordinates-> tap()   (semantic targets are
 *                                           resolved HERE via a fresh observe)
 *   mobile_type_keys (submit:false)      -> type()  (draft only, NEVER submit)
 *   mobile_swipe_on_screen               -> swipe() (start/end -> direction)
 *   mobile_press_button (BACK)           -> back()
 *
 * NORMALIZATION RULES LIVE HERE AND NOWHERE ELSE. Upper layers never see
 * mobile-mcp wire shapes: its text responses are parsed into ScreenState /
 * DeviceInfo / ActionResult, and its error texts are mapped onto MobileError
 * codes.
 *
 * Known wire limitations (documented, do not paper over):
 * - mobile-mcp exposes no foreground-app query → ScreenState.app is
 *   undefined for this provider (mock fills it; a future ADB provider can).
 * - Its element JSON carries no clickable/editable flags → they are inferred
 *   from the widget class name (see mapElement). Coordinates are always exact;
 *   the flags only steer the agent's next-action hints.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { MobileError, type MobileService } from '../capability/mobile.ts'
import type {
  ActionResult,
  DeviceInfo,
  ScreenState,
  SwipeGesture,
  TapTarget,
  UIElement,
} from '../capability/types.ts'

// --------------------------------------------------------------------------
// Options
// --------------------------------------------------------------------------

export interface MobileMcpOptions {
  transport:
    | {
        kind: 'stdio'
        /** Executable, e.g. process.execPath (node). */
        command: string
        /** Arguments, e.g. ['<mobile-mcp>/lib/index.js', '--stdio']. */
        args: string[]
        /** Extra environment (merged over a PATH-augmented process.env). */
        env?: Record<string, string>
      }
    | { kind: 'http'; url: string }
  /** Preferred device id when callers omit one. */
  defaultDeviceId?: string
  /**
   * Directory containing adb (SDK platform-tools). Prepended to PATH for the
   * stdio server so mobile-mcp finds adb without a global install.
   */
  adbDir?: string
}

/** Default stdio target: the vendored mobile-mcp build next to this package. */
export function defaultMobileMcpEntry(): string | undefined {
  // lib/providers/mobile-mcp.js → <repo>/framework/mobile-mcp/lib/index.js
  const candidate = fileURLToPath(new URL('../../../framework/mobile-mcp/lib/index.js', import.meta.url))
  return existsSync(candidate) ? candidate : undefined
}

/** Default adb directory on this machine, when the standard SDK path exists. */
export function defaultAdbDir(): string | undefined {
  const localAppData = process.env.LOCALAPPDATA
  if (localAppData === undefined || localAppData === '') return undefined
  const candidate = `${localAppData}\\Android\\Sdk\\platform-tools`
  return existsSync(candidate) ? candidate : undefined
}

// --------------------------------------------------------------------------
// Wire parsing (exported for tests — the ONLY place wire shapes are known)
// --------------------------------------------------------------------------

/** mobile_list_available_devices returns raw JSON: { devices: [...] }. */
export function parseDevicesResponse(text: string): Array<Record<string, unknown>> {
  const start = text.indexOf('{')
  if (start < 0) throw new MobileError('PROVIDER_UNAVAILABLE', `unexpected devices response: ${text.slice(0, 120)}`)
  const parsed = JSON.parse(text.slice(start)) as { devices?: Array<Record<string, unknown>> }
  return parsed.devices ?? []
}

/** "Screen size is 1080x2400 pixels" → { width, height }. */
export function parseScreenSize(text: string): { width: number; height: number } {
  const match = /(\d+)\s*x\s*(\d+)/.exec(text)
  if (match === null) throw new MobileError('PROVIDER_UNAVAILABLE', `unexpected screen-size response: ${text.slice(0, 120)}`)
  return { width: Number(match[1]), height: Number(match[2]) }
}

/** "Found these elements on screen: [ {...} ]" → raw element records. */
export function parseElementsResponse(text: string): Array<Record<string, unknown>> {
  const start = text.indexOf('[')
  if (start < 0) throw new MobileError('PROVIDER_UNAVAILABLE', `unexpected elements response: ${text.slice(0, 120)}`)
  return JSON.parse(text.slice(start)) as Array<Record<string, unknown>>
}

/** One mobile-mcp element record → normalized UIElement. */
export function mapElement(raw: Record<string, unknown>): UIElement {
  const rect = (raw.coordinates ?? raw.rect) as { x: number; y: number; width: number; height: number }
  const type = typeof raw.type === 'string' ? raw.type : ''
  const text = (raw.text ?? raw.label ?? raw.name) as string | undefined
  const label = raw.label as string | undefined
  const element: UIElement = {
    className: type === '' ? undefined : type,
    bounds: {
      left: Math.round(rect.x),
      top: Math.round(rect.y),
      right: Math.round(rect.x + rect.width),
      bottom: Math.round(rect.y + rect.height),
    },
  }
  if (typeof raw.identifier === 'string' && raw.identifier !== '') element.id = raw.identifier
  if (typeof text === 'string' && text !== '') element.text = text
  if (typeof label === 'string' && label !== '' && label !== text) element.description = label
  if (/edit|input|textfield|search/i.test(type)) element.editable = true
  if (/button|click|link|tab|menu|item|icon|check|radio|switch|spinner/i.test(type)) element.clickable = true
  if (/scroll|list|recycler|pager/i.test(type)) element.scrollable = true
  return element
}

/** Our point-to-point gesture → mobile-mcp's direction-based swipe. */
export function swipeToDirection(gesture: SwipeGesture): { direction: 'up' | 'down' | 'left' | 'right'; x: number; y: number; distance: number } {
  const dx = gesture.end.x - gesture.start.x
  const dy = gesture.end.y - gesture.start.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { direction: dx >= 0 ? 'right' : 'left', x: gesture.start.x, y: gesture.start.y, distance: Math.abs(dx) }
  }
  return { direction: dy >= 0 ? 'down' : 'up', x: gesture.start.x, y: gesture.start.y, distance: Math.abs(dy) }
}

/** Map a mobile-mcp failure text onto a routable MobileError. */
function mapProviderError(toolName: string, text: string): MobileError {
  if (/no (devices|emulators|simulators)|device offline|no emulators/i.test(text)) {
    return new MobileError('NO_DEVICE', `${toolName}: ${text}`)
  }
  if (/device .*(not found|unknown)/i.test(text)) {
    return new MobileError('DEVICE_NOT_FOUND', `${toolName}: ${text}`)
  }
  return new MobileError('PROVIDER_UNAVAILABLE', `${toolName}: ${text}`)
}

// --------------------------------------------------------------------------
// Provider
// --------------------------------------------------------------------------

export class MobileMcpProvider implements MobileService {
  readonly providerName = 'mobile-mcp'

  private clientPromise: Promise<Client> | undefined
  /** Screen size is fixed per device at runtime — cache it, skip a ~1s MCP round-trip per observe. */
  private readonly screenSizeCache = new Map<string, { width: number; height: number }>()

  constructor(private readonly options: MobileMcpOptions) {}

  /** Close the MCP connection (and the spawned stdio server). */
  async dispose(): Promise<void> {
    await this.resetConnection()
  }

  async getDevices(): Promise<DeviceInfo[]> {
    const text = await this.callText('mobile_list_available_devices', {})
    const rawDevices = parseDevicesResponse(text)
    const devices: DeviceInfo[] = []
    for (const raw of rawDevices) {
      const id = String(raw.id ?? '')
      if (id === '') continue
      let screen = this.screenSizeCache.get(id) ?? { width: 0, height: 0 }
      try {
        screen = await this.getScreenSize(id)
      } catch {
        // Screen size is best-effort in the listing; observe() refines it.
      }
      devices.push({
        id,
        platform: raw.platform === 'ios' ? 'ios' : 'android',
        name: typeof raw.name === 'string' ? raw.name : undefined,
        screen,
      })
    }
    if (devices.length === 0) {
      throw new MobileError('NO_DEVICE', 'mobile-mcp reports no online devices — start the Android emulator first')
    }
    return devices
  }

  async observe(deviceId?: string): Promise<ScreenState> {
    const device = await this.resolveDevice(deviceId)
    const screen = await this.getScreenSize(device)
    const elementsText = await this.callText('mobile_list_elements_on_screen', { device })
    const elements = parseElementsResponse(elementsText).map(mapElement)
    return {
      deviceId: device,
      // app is intentionally undefined: mobile-mcp has no foreground-app query.
      screen,
      elements,
      timestamp: Date.now(),
    }
  }

  async openApp(app: string, deviceId?: string): Promise<ActionResult> {
    const device = await this.resolveDevice(deviceId)
    try {
      await this.callText('mobile_launch_app', { device, packageName: app })
      return { ok: true, summary: `launched ${app} on ${device}` }
    } catch (error) {
      return this.actionFailure('open app', error)
    }
  }

  async tap(target: TapTarget, deviceId?: string): Promise<ActionResult> {
    const device = await this.resolveDevice(deviceId)
    let point: { x: number; y: number }
    let label: string
    if ('x' in target) {
      point = { x: target.x, y: target.y }
      label = `(${target.x},${target.y})`
    } else {
      // Semantic targeting: resolve against a FRESH observation, then tap the
      // element center. mobile-mcp only knows coordinates.
      const screen = await this.observe(device)
      const element = this.findElement(screen.elements, target)
      if (element === undefined) {
        return {
          ok: false,
          summary: `no element matching ${JSON.stringify(target)} on the current screen`,
          error: 'ELEMENT_NOT_FOUND',
        }
      }
      point = {
        x: Math.round((element.bounds.left + element.bounds.right) / 2),
        y: Math.round((element.bounds.top + element.bounds.bottom) / 2),
      }
      label = element.text ?? element.id ?? 'element'
    }
    try {
      await this.callText('mobile_click_on_screen_at_coordinates', { device, x: point.x, y: point.y })
      return { ok: true, summary: `tapped '${label}' at (${point.x},${point.y})` }
    } catch (error) {
      return this.actionFailure('tap', error)
    }
  }

  async type(text: string, deviceId?: string): Promise<ActionResult> {
    const device = await this.resolveDevice(deviceId)
    try {
      // submit is HARD-FALSE: MobileService.type produces a draft only.
      await this.callText('mobile_type_keys', { device, text, submit: false })
      return { ok: true, summary: `typed ${text.length} chars into the focused element (draft only, NOT sent)` }
    } catch (error) {
      return this.actionFailure('type', error, 'NOT_EDITABLE')
    }
  }

  async swipe(gesture: SwipeGesture, deviceId?: string): Promise<ActionResult> {
    const device = await this.resolveDevice(deviceId)
    const spec = swipeToDirection(gesture)
    try {
      await this.callText('mobile_swipe_on_screen', { device, ...spec })
      return { ok: true, summary: `swiped ${spec.direction} ${spec.distance}px from (${spec.x},${spec.y})` }
    } catch (error) {
      return this.actionFailure('swipe', error)
    }
  }

  async back(deviceId?: string): Promise<ActionResult> {
    const device = await this.resolveDevice(deviceId)
    try {
      await this.callText('mobile_press_button', { device, button: 'BACK' })
      return { ok: true, summary: 'pressed BACK' }
    } catch (error) {
      return this.actionFailure('back', error)
    }
  }

  // ------------------------------------------------------------------ intern

  /** Cached screen size: one MCP call per device per provider lifetime. */
  private async getScreenSize(device: string): Promise<{ width: number; height: number }> {
    const cached = this.screenSizeCache.get(device)
    if (cached !== undefined) return cached
    const size = parseScreenSize(await this.callText('mobile_get_screen_size', { device }))
    this.screenSizeCache.set(device, size)
    return size
  }

  private findElement(elements: UIElement[], target: TapTarget): UIElement | undefined {
    if ('elementId' in target) return elements.find(el => el.id === target.elementId)
    if ('text' in target) {
      return elements.find(el => el.text === target.text)
        ?? elements.find(el => el.text?.includes(target.text) === true)
    }
    return elements.find(el =>
      target.x >= el.bounds.left && target.x <= el.bounds.right &&
      target.y >= el.bounds.top && target.y <= el.bounds.bottom)
  }

  private async resolveDevice(deviceId?: string): Promise<string> {
    if (deviceId !== undefined) return deviceId
    if (this.options.defaultDeviceId !== undefined) return this.options.defaultDeviceId
    const devices = await this.getDevices()
    const first = devices[0]
    if (first === undefined) throw new MobileError('NO_DEVICE', 'no online devices')
    return first.id
  }

  private actionFailure(verb: string, error: unknown, codeHint?: 'NOT_EDITABLE'): ActionResult {
    if (error instanceof MobileError) {
      return { ok: false, summary: `${verb} failed: ${error.message}`, error: error.code }
    }
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, summary: `${verb} failed: ${message}`, error: codeHint ?? 'PROVIDER_UNAVAILABLE' }
  }

  /** Call one MCP tool and return its first text block; map failures. */
  private async callText(name: string, args: Record<string, unknown>): Promise<string> {
    const client = await this.connect()
    let result
    try {
      result = await client.callTool({ name, arguments: args })
    } catch (error) {
      // A thrown call (timeout -32001, dead transport, wedged server) means the
      // server process can no longer be trusted: tear it down so the NEXT call
      // spawns a fresh one. This call still fails; recovery is one retry away.
      await this.resetConnection()
      const message = error instanceof Error ? error.message : String(error)
      throw mapProviderError(name, `${message} (mobile-mcp server was reset; retry the action)`)
    }
    const content = (result as { content?: Array<{ type: string; text?: string }>; isError?: boolean })
    const text = content.content?.find(block => block.type === 'text')?.text ?? ''
    if (content.isError === true) throw mapProviderError(name, text)
    return text
  }

  /** Drop the current client, closing its transport and the spawned server. */
  private async resetConnection(): Promise<void> {
    const pending = this.clientPromise
    this.clientPromise = undefined
    if (pending === undefined) return
    const client = await pending.catch(() => undefined)
    if (client === undefined) return
    // StdioClientTransport.close() can hang when the child is wedged — bound it.
    await Promise.race([
      client.close().catch(() => undefined),
      new Promise<void>(resolve => setTimeout(resolve, 3000)),
    ])
  }

  private connect(): Promise<Client> {
    this.clientPromise ??= this.doConnect()
    return this.clientPromise
  }

  private async doConnect(): Promise<Client> {
    const client = new Client({ name: 'dsh-mobile', version: '0.1.0' })
    if (this.options.transport.kind === 'http') {
      await client.connect(new StreamableHTTPClientTransport(new URL(this.options.transport.url)))
      return client
    }
    const stdio = this.options.transport
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string') env[key] = value
    }
    const adbDir = this.options.adbDir ?? defaultAdbDir()
    if (adbDir !== undefined) env.PATH = `${adbDir};${env.PATH ?? ''}`
    Object.assign(env, stdio.env ?? {})
    const transport = new StdioClientTransport({
      command: stdio.command,
      args: stdio.args,
      env,
      stderr: 'pipe',
    })
    await client.connect(transport)
    return client
  }
}
