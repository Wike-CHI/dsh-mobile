/**
 * Dynamic runtime context (docs/CONTEXT_ENGINEERING.md, "Dynamic Runtime
 * Context"): the `<mobile_runtime>` block, evaluated at every prompt assembly
 * from MobileRuntimeState. Empty until the first observation — an empty
 * contribution is dropped, so an idle plugin costs zero prompt tokens.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { formatRuntimeContext } from './formatter.ts'
import type { MobileRuntimeState } from '../state/runtime-state.ts'

/** Contexts join in ascending order; mobile facts are mid-band. */
const CONTEXT_ORDER = 100

export function registerMobileRuntimeContext(ctx: Context, state: MobileRuntimeState): void {
  ctx.systemPrompt.context({
    name: 'dsh-mobile:runtime',
    order: CONTEXT_ORDER,
    text: () => formatRuntimeContext(state),
  })
}
