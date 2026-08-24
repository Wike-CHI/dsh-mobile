/**
 * Tool registration: the five model-facing consumers of ctx.mobile.
 *
 * Phase-1 action space (docs/HARNESS_ARCHITECTURE.md):
 *   mobile_observe   Tier 0  read
 *   mobile_open_app  Tier 1  navigation
 *   mobile_tap       Tier 1  navigation
 *   mobile_type      Tier 2  draft/input (never submits)
 *   mobile_back      Tier 1  navigation
 *
 * mobile_swipe is deliberately deferred: five tools are enough to prove the
 * loop, and every added tool is paid for in every prompt.
 */

import type { Context } from '@deepseek-ai/cordis'
import { mobileBackTool } from './back.ts'
import { mobileObserveTool } from './observe.ts'
import { mobileOpenAppTool } from './open-app.ts'
import { mobileTapTool } from './tap.ts'
import { mobileTypeTool } from './type.ts'
import type { ToolDeps } from './common.ts'

export function registerMobileTools(ctx: Context, deps: ToolDeps): void {
  const tools = [
    mobileObserveTool(deps),
    mobileOpenAppTool(deps),
    mobileTapTool(deps),
    mobileTypeTool(deps),
    mobileBackTool(deps),
  ]
  ctx.effect(() => {
    const disposers = tools.map(tool => ctx.tools.register(tool))
    return () => { for (const dispose of disposers) dispose() }
  }, 'dsh-mobile: tools')
}

export type { ToolDeps } from './common.ts'
