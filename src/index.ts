/**
 * dsh-mobile — host plugin entry. Deliberately thin:
 *
 *   apply()  =  pick provider -> ctx.provide('mobile', provider)
 *             -> register tools / prompt sections / runtime context / policy
 *
 * All substance lives in capability/ (contract), providers/ (execution
 * plane), tools/ (consumers), context/ (prompt plane), policy/ (hard rules),
 * and state/ (derived runtime facts). See docs/HARNESS_ARCHITECTURE.md.
 */

import type { Context } from '@deepseek-ai/cordis'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { MobileError, type MobileService } from './capability/mobile.ts'
import { MockMobileProvider } from './providers/mock.ts'
import { defaultMobileMcpEntry, MobileMcpProvider } from './providers/mobile-mcp.ts'
import { registerMobileContext } from './context/system.ts'
import { registerMobileRuntimeContext } from './context/runtime.ts'
import { registerMobilePolicy } from './policy/mobile-policy.ts'
import { registerMobileTools } from './tools/index.ts'
import { MobileRuntimeState } from './state/runtime-state.ts'

/** Stable cordis plugin name. */
export const name = 'dsh-mobile'

/** Hard dependencies: prompt registry and tool runtime. */
export const inject = ['tools', 'systemPrompt']

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /**
   * Execution backend. 'mock' (default) works offline; 'mobile-mcp' drives a
   * real device (Android emulator / adb) through the mobile-mcp MCP server.
   */
  provider?: 'mock' | 'mobile-mcp'
  /**
   * Absolute path to the mobile-mcp server entry (lib/index.js). Defaults to
   * the vendored build at <workspace>/framework/mobile-mcp/lib/index.js.
   */
  mobileMcpPath?: string
  /** Preferred device id (e.g. emulator-5554); defaults to the first online device. */
  deviceId?: string
  /** Announce the plugin in the system prompt (default true). */
  announceToAgent?: boolean
  /** Master switch for tools, prompt contributions, and policy. */
  enabled?: boolean
}

export const Config: z<Config> = z.object({
  provider: z.union(['mock', 'mobile-mcp']).default('mock'),
  mobileMcpPath: z.string(),
  deviceId: z.string(),
  announceToAgent: z.boolean().default(true),
  enabled: z.boolean().default(true),
})

/** Construct the configured execution backend. */
function createProvider(config: Config): MobileService {
  if (config.provider === 'mobile-mcp') {
    const entry = config.mobileMcpPath ?? defaultMobileMcpEntry()
    if (entry === undefined) {
      throw new MobileError(
        'PROVIDER_UNAVAILABLE',
        "provider 'mobile-mcp' needs config.mobileMcpPath (the vendored framework/mobile-mcp build was not found next to this package)",
      )
    }
    return new MobileMcpProvider({
      transport: { kind: 'stdio', command: process.execPath, args: [entry, '--stdio'] },
      defaultDeviceId: config.deviceId,
    })
  }
  return new MockMobileProvider()
}

export function apply(ctx: Context, config?: Config): void {
  const resolved: Config = {
    provider: config?.provider ?? 'mock',
    announceToAgent: config?.announceToAgent ?? true,
    enabled: config?.enabled ?? true,
  }
  if (!resolved.enabled) return

  const provider = createProvider(resolved)
  const state = new MobileRuntimeState()
  state.providerName = provider.providerName

  // Capability seam: the definition is provided once; consumers resolve it
  // per call via ctx.get('mobile') so a later provider swap is picked up.
  ctx.provide('mobile', provider)
  ctx.effect(() => () => { void provider.dispose?.() }, 'dsh-mobile: provider')

  registerMobileTools(ctx, { getMobile: () => ctx.get('mobile') ?? provider, state })
  registerMobileContext(ctx, { announce: resolved.announceToAgent ?? true })
  registerMobileRuntimeContext(ctx, state)
  registerMobilePolicy(ctx)
}

export type { MobileService } from './capability/mobile.ts'
export { MobileError } from './capability/mobile.ts'
export type * from './capability/types.ts'
export { MockMobileProvider } from './providers/mock.ts'
export { MobileRuntimeState } from './state/runtime-state.ts'
