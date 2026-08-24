import { describe, expect, it } from 'vitest'
import { MockMobileProvider } from '../src/providers/mock.ts'
import { MobileRuntimeState } from '../src/state/runtime-state.ts'
import { mobileObserveTool } from '../src/tools/observe.ts'
import { mobileOpenAppTool } from '../src/tools/open-app.ts'
import { mobileTapTool, resolveTapArgs } from '../src/tools/tap.ts'
import { mobileTypeTool } from '../src/tools/type.ts'
import { mobileBackTool } from '../src/tools/back.ts'
import { tierOf } from '../src/policy/mobile-policy.ts'
import type { ToolDeps } from '../src/tools/common.ts'

function makeDeps() {
  const provider = new MockMobileProvider()
  const state = new MobileRuntimeState()
  state.providerName = provider.providerName
  const deps: ToolDeps = { getMobile: () => provider, state }
  return { provider, state, deps }
}

// Tool definitions carry execute(args, exec); tests call the body directly.
async function run(tool: { execute: (args: any, exec?: any) => Promise<unknown> }, args: unknown): Promise<any> {
  return tool.execute(args, undefined)
}

describe('mobile_observe', () => {
  it('returns the success envelope with a screen and records the observation', async () => {
    const { deps, state } = makeDeps()
    const result = await run(mobileObserveTool(deps), {})
    expect(result.status).toBe('success')
    expect(result.screen.deviceId).toBe('mock-device')
    expect(result.nextActions.length).toBeGreaterThan(0)
    expect(state.currentDeviceId).toBe('mock-device')
    expect(state.recentObservations).toHaveLength(1)
  })
})

describe('mobile_open_app', () => {
  it('opens a known app and suggests verification', async () => {
    const { deps } = makeDeps()
    const result = await run(mobileOpenAppTool(deps), { app: 'com.example.chat' })
    expect(result.status).toBe('success')
    expect(result.nextActions.join(' ')).toContain('mobile_observe')
  })

  it('returns an error envelope for an unknown app', async () => {
    const { deps } = makeDeps()
    const result = await run(mobileOpenAppTool(deps), { app: 'com.nope' })
    expect(result.status).toBe('error')
    expect(result.summary).toContain('APP_NOT_FOUND')
  })
})

describe('mobile_tap', () => {
  it('rejects calls without a target before touching the provider', async () => {
    const { deps } = makeDeps()
    const result = await run(mobileTapTool(deps), {})
    expect(result.status).toBe('error')
    expect(result.summary).toContain('exactly one target')
  })

  it('taps by text and records the action', async () => {
    const { deps, state } = makeDeps()
    await run(mobileOpenAppTool(deps), { app: 'chat' })
    const result = await run(mobileTapTool(deps), { text: '张三' })
    expect(result.status).toBe('success')
    expect(state.lastAction?.tool).toBe('mobile_tap')
    expect(state.lastAction?.ok).toBe(true)
  })

  it('returns a recovery hint when the element is gone', async () => {
    const { deps } = makeDeps()
    const result = await run(mobileTapTool(deps), { elementId: 'ghost' })
    expect(result.status).toBe('error')
    expect(result.nextActions.join(' ')).toContain('mobile_observe')
  })
})

describe('resolveTapArgs', () => {
  it('prefers elementId, then text, then coordinates', () => {
    expect(resolveTapArgs({ elementId: 'a', text: 'b' })).toEqual({ elementId: 'a' })
    expect(resolveTapArgs({ text: 'b' })).toEqual({ text: 'b' })
    expect(resolveTapArgs({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 })
    expect(typeof resolveTapArgs({ x: 1 })).toBe('string')
  })
})

describe('mobile_type', () => {
  it('types a draft and states it was NOT sent', async () => {
    const { deps } = makeDeps()
    await run(mobileOpenAppTool(deps), { app: 'chat' })
    await run(mobileTapTool(deps), { text: '张三' })
    const result = await run(mobileTypeTool(deps), { text: '草稿内容' })
    expect(result.status).toBe('success')
    expect(result.summary).toContain('NOT sent')
  })
})

describe('mobile_back', () => {
  it('navigates back', async () => {
    const { deps } = makeDeps()
    await run(mobileOpenAppTool(deps), { app: 'chat' })
    const result = await run(mobileBackTool(deps), {})
    expect(result.status).toBe('success')
  })
})

describe('policy tiers', () => {
  it('classifies the phase-1 action space', () => {
    expect(tierOf('mobile_observe')).toBe(0)
    expect(tierOf('mobile_tap')).toBe(1)
    expect(tierOf('mobile_type')).toBe(2)
    expect(tierOf('mobile_send')).toBe(3)
    expect(tierOf('payment')).toBe(4)
  })

  it('fails closed: unknown mobile_* verbs default to tier 3, non-mobile tools are unpoliced', () => {
    expect(tierOf('mobile_future_verb')).toBe(3)
    expect(tierOf('bash')).toBeUndefined()
  })
})
