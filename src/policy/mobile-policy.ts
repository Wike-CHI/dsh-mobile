/**
 * Mobile execution policy — HARD constraints, riding the harness tool
 * pipeline instead of the prompt (docs/HARNESS_ARCHITECTURE.md, "Policy").
 *
 *   Tier 0  read        mobile_observe                       auto
 *   Tier 1  navigation  mobile_open_app/tap/swipe/back       auto
 *   Tier 2  draft/input mobile_type                          auto (never submits)
 *   Tier 3  external    mobile_send, post_publish, ...       ask (approval)
 *   Tier 4  high-risk   payment, delete_account, ...         deny
 *
 * Two mechanisms, matching the dsh-tools pipeline:
 *
 * - `tools/pre-execute` waterfall: Tier-3 calls become `{ kind: 'ask' }`,
 *   which resolves through the deployment's approval service (and degrades to
 *   deny where no approval channel exists).
 * - `ctx.tools.guard()`: monotonic Tier-4 denial — guards cannot be
 *   overridden by any allow decision elsewhere in the pipeline.
 *
 * Prompt rules are the soft layer; this file is the hard layer.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'

/** Capability tiers by tool name. Unknown mobile_* names default to Tier 3. */
export const TOOL_TIERS: Record<string, number> = {
  // Tier 0 — read
  mobile_observe: 0,
  mobile_get_devices: 0,
  // Tier 1 — navigation
  mobile_open_app: 1,
  mobile_tap: 1,
  mobile_swipe: 1,
  mobile_back: 1,
  // Tier 2 — draft/input (never submits)
  mobile_type: 2,
  // Tier 3 — external effect (reserved; not shipped in phase 1)
  mobile_send: 3,
  conversation_send: 3,
  post_publish: 3,
  like: 3,
  follow: 3,
  submit_form: 3,
  // Tier 4 — high risk
  payment: 4,
  purchase: 4,
  delete_account: 4,
  delete_contact: 4,
  grant_authorization: 4,
}

/** Resolve the tier of a tool call; non-mobile tools are not policed here. */
export function tierOf(toolName: string): number | undefined {
  const known = TOOL_TIERS[toolName]
  if (known !== undefined) return known
  if (toolName.startsWith('mobile_')) return 3 // fail-closed for new mobile verbs
  return undefined
}

export function registerMobilePolicy(ctx: Context): void {
  // Tier 3 -> ask. Non-mobile and lower tiers delegate untouched.
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (tierOf(exec.name) === 3) {
      return {
        kind: 'ask',
        reason: `'${exec.name}' has an external effect (sends/publishes/submits). ` +
          'Confirm with the user exactly what will be sent, to whom, before approving.',
      }
    }
    return next()
  })

  // Tier 4 -> hard deny. Monotonic: no other listener can re-allow.
  ctx.effect(() => ctx.tools.guard(execution => {
    if (tierOf(execution.name) === 4) {
      return `'${execution.name}' is a high-risk operation (payment/deletion/authorization) ` +
        'and is denied by dsh-mobile policy. This denial cannot be overridden by the agent.'
    }
    return undefined
  }), 'dsh-mobile: tier-4 guard')
}
