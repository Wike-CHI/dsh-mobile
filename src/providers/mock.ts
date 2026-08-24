/**
 * MockMobileProvider — a scripted, in-memory execution backend.
 *
 * Purpose: stabilize the CONTROL PLANE (plugin -> service -> tools -> context
 * -> agent reasoning) before any real EXECUTION PLANE (ADB / mobile-mcp /
 * emulator) is attached. It simulates a small chat application so the full
 * observe -> tap -> type -> back loop is exercisable in tests and in a live
 * DSH session without hardware.
 *
 * Simulated app `com.example.chat`:
 *
 *   home (launcher)
 *     └─ openApp('chat') ──> chat-list (张三 / 李四)
 *                               └─ tap '张三' ──> chat-detail
 *                                                    ├─ tap input -> focus
 *                                                    ├─ type '...' -> draft
 *                                                    └─ tap '发送' -> message appended
 */

import { MobileError, type MobileService } from '../capability/mobile.ts'
import type {
  ActionResult,
  DeviceInfo,
  ScreenState,
  SwipeGesture,
  TapTarget,
  UIElement,
} from '../capability/types.ts'

const WIDTH = 1080
const HEIGHT = 2400

type SceneName = 'home' | 'chat-list' | 'chat-detail'

interface ChatMessage {
  from: 'me' | 'them'
  text: string
}

/** The whole simulated world. */
interface MockWorld {
  scene: SceneName
  contact: string | null
  focusedInput: boolean
  draft: string
  messages: ChatMessage[]
}

const INITIAL_MESSAGES: ChatMessage[] = [
  { from: 'them', text: '晚上一起吃饭吗?' },
  { from: 'me', text: '可以,几点?' },
  { from: 'them', text: '七点老地方' },
]

function row(index: number, total: number): { left: number; top: number; right: number; bottom: number } {
  const top = 300 + index * 220
  return { left: 0, top, right: WIDTH, bottom: Math.min(top + 200, HEIGHT - 400) }
}

export class MockMobileProvider implements MobileService {
  readonly providerName = 'mock'

  private world: MockWorld = {
    scene: 'home',
    contact: null,
    focusedInput: false,
    draft: '',
    messages: [...INITIAL_MESSAGES],
  }

  async getDevices(): Promise<DeviceInfo[]> {
    return [{
      id: 'mock-device',
      platform: 'android',
      name: 'Mock Emulator',
      screen: { width: WIDTH, height: HEIGHT },
    }]
  }

  async observe(): Promise<ScreenState> {
    return {
      deviceId: 'mock-device',
      app: this.appOf(this.world.scene),
      screen: { width: WIDTH, height: HEIGHT },
      elements: this.elementsOf(this.world),
      timestamp: Date.now(),
    }
  }

  async openApp(app: string): Promise<ActionResult> {
    const normalized = app.toLowerCase()
    if (normalized === 'chat' || normalized === 'com.example.chat') {
      this.world.scene = 'chat-list'
      this.world.contact = null
      this.world.focusedInput = false
      return { ok: true, summary: 'opened com.example.chat (conversation list)' }
    }
    if (normalized === 'photos' || normalized === 'com.example.photos') {
      this.world.scene = 'home'
      return { ok: true, summary: 'opened com.example.photos (mock renders it as launcher)' }
    }
    return { ok: false, summary: `app '${app}' not found`, error: 'APP_NOT_FOUND' }
  }

  async tap(target: TapTarget): Promise<ActionResult> {
    const screen = await this.observe()
    const element = this.resolveTarget(screen, target)
    if (element === undefined) {
      return {
        ok: false,
        summary: 'no matching element on the current screen',
        error: 'ELEMENT_NOT_FOUND',
      }
    }
    return this.activate(element)
  }

  async type(text: string): Promise<ActionResult> {
    const screen = await this.observe()
    const editable = screen.elements.find(el => el.editable === true)
    if (editable === undefined) {
      return {
        ok: false,
        summary: 'no editable element on the current screen',
        error: 'NOT_EDITABLE',
      }
    }
    this.world.focusedInput = true
    this.world.draft = text
    return { ok: true, summary: `typed ${text.length} chars into '${editable.id ?? 'input'}' (draft only, NOT sent)` }
  }

  async swipe(_gesture: SwipeGesture): Promise<ActionResult> {
    return { ok: true, summary: 'swiped (mock: no scrollable content changes)' }
  }

  async back(): Promise<ActionResult> {
    if (this.world.scene === 'chat-detail') {
      this.world.scene = 'chat-list'
      this.world.contact = null
      this.world.focusedInput = false
      this.world.draft = ''
      return { ok: true, summary: 'back -> conversation list' }
    }
    if (this.world.scene === 'chat-list') {
      this.world.scene = 'home'
      return { ok: true, summary: 'back -> launcher' }
    }
    return { ok: true, summary: 'back at launcher (no-op)' }
  }

  // ------------------------------------------------------------------ scenes

  private appOf(scene: SceneName): ScreenState['app'] {
    if (scene === 'home') return { packageName: 'com.android.launcher' }
    return {
      packageName: 'com.example.chat',
      activity: scene === 'chat-detail' ? '.ChatActivity' : '.MainActivity',
    }
  }

  private elementsOf(world: MockWorld): UIElement[] {
    if (world.scene === 'home') {
      return [
        { id: 'icon-chat', text: '聊天', className: 'android.widget.TextView', bounds: row(0, 2), clickable: true },
        { id: 'icon-photos', text: '相册', className: 'android.widget.TextView', bounds: row(1, 2), clickable: true },
      ]
    }
    if (world.scene === 'chat-list') {
      return [
        { id: 'title', text: '消息', className: 'android.widget.TextView', bounds: { left: 0, top: 100, right: WIDTH, bottom: 280 } },
        { id: 'conv-zhangsan', text: '张三', description: '2 条未读: 七点老地方', className: 'android.view.ViewGroup', bounds: row(0, 2), clickable: true },
        { id: 'conv-lisi', text: '李四', description: '暂无新消息', className: 'android.view.ViewGroup', bounds: row(1, 2), clickable: true },
      ]
    }
    // chat-detail
    const elements: UIElement[] = [
      { id: 'title', text: world.contact ?? '对话', className: 'android.widget.TextView', bounds: { left: 0, top: 100, right: WIDTH, bottom: 280 } },
    ]
    world.messages.forEach((message, index) => {
      elements.push({
        id: `msg-${index}`,
        text: `${message.from === 'me' ? '我' : world.contact ?? '对方'}: ${message.text}`,
        className: 'android.widget.TextView',
        bounds: row(index, world.messages.length + 2),
      })
    })
    elements.push({
      id: 'input',
      text: world.draft === '' ? undefined : world.draft,
      description: world.focusedInput ? '输入框(已聚焦)' : '输入框',
      className: 'android.widget.EditText',
      bounds: { left: 0, top: HEIGHT - 380, right: WIDTH - 220, bottom: HEIGHT - 220 },
      editable: true,
      clickable: true,
    })
    elements.push({
      id: 'send',
      text: '发送',
      className: 'android.widget.Button',
      bounds: { left: WIDTH - 200, top: HEIGHT - 380, right: WIDTH, bottom: HEIGHT - 220 },
      clickable: true,
    })
    return elements
  }

  // ----------------------------------------------------------------- actions

  private resolveTarget(screen: ScreenState, target: TapTarget): UIElement | undefined {
    if ('elementId' in target) {
      return screen.elements.find(el => el.id === target.elementId)
    }
    if ('text' in target) {
      const needle = target.text
      return screen.elements.find(el => el.text === needle)
        ?? screen.elements.find(el => el.text?.includes(needle) === true)
    }
    const { x, y } = target
    return screen.elements.find(el =>
      x >= el.bounds.left && x <= el.bounds.right && y >= el.bounds.top && y <= el.bounds.bottom)
  }

  private activate(element: UIElement): ActionResult {
    const label = element.text ?? element.id ?? 'element'
    if (element.clickable !== true) {
      return { ok: true, summary: `tapped '${label}' (not clickable, no effect)` }
    }
    // Scene transitions owned by the simulation.
    if (element.id === 'icon-chat') return { ...this.syncOpen('chat'), summary: `tapped '${label}' -> conversation list` }
    if (element.id === 'conv-zhangsan' || element.id === 'conv-lisi') {
      this.world.scene = 'chat-detail'
      this.world.contact = element.text ?? null
      this.world.focusedInput = false
      this.world.draft = ''
      return { ok: true, summary: `tapped '${label}' -> chat detail` }
    }
    if (element.id === 'input') {
      this.world.focusedInput = true
      return { ok: true, summary: 'tapped input -> focused' }
    }
    if (element.id === 'send') {
      if (this.world.draft === '') return { ok: true, summary: 'tapped 发送 with empty draft (no message sent)' }
      const sent = this.world.draft
      this.world.messages.push({ from: 'me', text: sent })
      this.world.draft = ''
      return { ok: true, summary: `sent message: '${sent}'` }
    }
    return { ok: true, summary: `tapped '${label}'` }
  }

  private syncOpen(app: string): ActionResult {
    this.world.scene = 'chat-list'
    this.world.contact = null
    return { ok: true, summary: `opened ${app}` }
  }
}

/** Guard used by the plugin entry when an unknown provider is configured. */
export function assertMockUsable(): void {
  if (typeof Date.now !== 'function') {
    throw new MobileError('PROVIDER_UNAVAILABLE', 'mock provider requires a clock')
  }
}
