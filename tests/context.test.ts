import { describe, expect, it } from 'vitest'
import {
  formatRuntimeContext,
  formatScreenForModel,
  OBSERVATION_ELEMENTS_BUDGET,
  RUNTIME_CONTEXT_BUDGET,
} from '../src/context/formatter.ts'
import { MobileRuntimeState } from '../src/state/runtime-state.ts'
import { MockMobileProvider } from '../src/providers/mock.ts'
import type { ScreenState, UIElement } from '../src/capability/types.ts'

function makeScreen(elements: UIElement[]): ScreenState {
  return {
    deviceId: 'mock-device',
    app: { packageName: 'com.example.chat' },
    screen: { width: 1080, height: 2400 },
    elements,
    timestamp: Date.now(),
  }
}

describe('formatRuntimeContext', () => {
  it('renders nothing before the first observation (zero idle token cost)', () => {
    const state = new MobileRuntimeState()
    expect(formatRuntimeContext(state)).toBe('')
  })

  it('renders device, app, and last action after activity', async () => {
    const provider = new MockMobileProvider()
    const state = new MobileRuntimeState()
    state.providerName = provider.providerName
    state.recordObservation(await provider.observe())
    state.recordAction('mobile_open_app', true, 'opened com.example.chat')

    const text = formatRuntimeContext(state)
    expect(text).toContain('<mobile_runtime>')
    expect(text).toContain('id: mock-device')
    expect(text).toContain('package: com.android.launcher')
    expect(text).toContain('last_action: mobile_open_app')
    expect(text).toContain('last_action_status: success')
    expect(text.length).toBeLessThanOrEqual(RUNTIME_CONTEXT_BUDGET)
  })

  it('respects the budget under pathological input', () => {
    const state = new MobileRuntimeState()
    state.providerName = 'mock'
    state.recordObservation(makeScreen(
      Array.from({ length: 50 }, (_, i) => ({
        text: '很长的文本'.repeat(20) + i,
        bounds: { left: 0, top: 0, right: 1, bottom: 1 },
      })),
    ))
    expect(formatRuntimeContext(state).length).toBeLessThanOrEqual(RUNTIME_CONTEXT_BUDGET)
  })
})

describe('formatScreenForModel', () => {
  it('renders header and one line per element', () => {
    const text = formatScreenForModel(makeScreen([
      { id: 'send', text: '发送', bounds: { left: 880, top: 2020, right: 1080, bottom: 2180 }, clickable: true },
    ]))
    expect(text).toContain('device: mock-device')
    expect(text).toContain('app: com.example.chat')
    expect(text).toContain('[send] "发送" {clickable} @(880,2020,1080,2180)')
  })

  it('truncates the element list to the observation budget and says so', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      id: `el-${i}`,
      text: `element-${i}`,
      bounds: { left: 0, top: i, right: 10, bottom: i + 10 },
    }))
    const text = formatScreenForModel(makeScreen(many))
    expect(text).toContain('truncated')
    expect(text.length).toBeLessThanOrEqual(OBSERVATION_ELEMENTS_BUDGET + 400) // header + truncation note
  })
})
