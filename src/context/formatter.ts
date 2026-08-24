/**
 * Context formatter — the ONLY place mobile facts become prompt text.
 *
 * Two outputs:
 *
 * 1. formatRuntimeContext() — the dynamic `<mobile_runtime>` block registered
 *    via ctx.systemPrompt.context(). Evaluated at every prompt assembly, so it
 *    must be cheap and BUDGET-BOUNDED. Returns '' when nothing has been
 *    observed yet (empty contexts contribute nothing).
 *
 * 2. formatScreenForModel() — the compact rendering of a ScreenState inside
 *    the mobile_observe tool result. Elements are flattened to one line each,
 *    salient attributes only, truncated to a character budget.
 *
 * Rule (docs/CONTEXT_ENGINEERING.md): context is SELECTED, never dumped.
 * Screenshots and raw XML hierarchies never enter prompt text from here.
 */

import type { ScreenState, UIElement } from '../capability/types.ts'
import type { MobileRuntimeState } from '../state/runtime-state.ts'

/** Character budget for the runtime context block (see ContextBudget). */
export const RUNTIME_CONTEXT_BUDGET = 1000
/** Character budget for the element list of one observation. */
export const OBSERVATION_ELEMENTS_BUDGET = 3000

/** Render the dynamic runtime context block, or '' when nothing is known. */
export function formatRuntimeContext(state: MobileRuntimeState): string {
  if (state.currentDeviceId === undefined) return ''

  const lines: string[] = ['<mobile_runtime>', 'device:']
  lines.push(`  id: ${state.currentDeviceId}`)
  lines.push(`  provider: ${state.providerName}`)
  if (state.screen !== undefined) {
    lines.push(`  resolution: ${state.screen.width}x${state.screen.height}`)
  }
  if (state.currentApp !== undefined) {
    lines.push('current_app:', `  package: ${state.currentApp}`)
  }
  if (state.lastAction !== undefined) {
    lines.push('execution:')
    lines.push(`  last_action: ${state.lastAction.tool}`)
    lines.push(`  last_action_status: ${state.lastAction.ok ? 'success' : 'failed'}`)
    lines.push(`  last_action_summary: ${state.lastAction.summary}`)
  }
  if (state.recentObservations.length > 0) {
    lines.push('recent_observations:')
    for (const obs of state.recentObservations.slice(-3)) {
      lines.push(`  - [${obs.app ?? 'unknown'}] ${obs.headline}`)
    }
  }
  lines.push('</mobile_runtime>')

  const text = lines.join('\n')
  if (text.length <= RUNTIME_CONTEXT_BUDGET) return text
  return text.slice(0, RUNTIME_CONTEXT_BUDGET - 20) + '\n...[truncated]\n</mobile_runtime>'
}

/** One compact line per element: [id] "text" (desc) {clickable,editable} @(l,t,r,b). */
export function formatElement(el: UIElement): string {
  const parts: string[] = []
  if (el.id !== undefined) parts.push(`[${el.id}]`)
  if (el.text !== undefined) parts.push(`"${el.text}"`)
  if (el.description !== undefined) parts.push(`(${el.description})`)
  const flags = [
    el.clickable === true ? 'clickable' : undefined,
    el.editable === true ? 'editable' : undefined,
    el.scrollable === true ? 'scrollable' : undefined,
  ].filter(Boolean)
  if (flags.length > 0) parts.push(`{${flags.join(',')}}`)
  parts.push(`@(${el.bounds.left},${el.bounds.top},${el.bounds.right},${el.bounds.bottom})`)
  return parts.join(' ')
}

/** Render a ScreenState for the model, bounded to the observation budget. */
export function formatScreenForModel(screen: ScreenState): string {
  const header = [
    `device: ${screen.deviceId}`,
    screen.app !== undefined
      ? `app: ${screen.app.packageName}${screen.app.activity !== undefined ? ' ' + screen.app.activity : ''}`
      : 'app: unknown',
    `screen: ${screen.screen.width}x${screen.screen.height}`,
    `elements: ${screen.elements.length}`,
  ].join('\n')

  const lines: string[] = []
  let used = 0
  for (const el of screen.elements) {
    const line = formatElement(el)
    if (used + line.length + 1 > OBSERVATION_ELEMENTS_BUDGET) {
      lines.push(`... ${screen.elements.length - lines.length} more element(s) truncated (budget ${OBSERVATION_ELEMENTS_BUDGET} chars)`)
      break
    }
    lines.push(line)
    used += line.length + 1
  }
  return `${header}\n${lines.join('\n')}`
}
