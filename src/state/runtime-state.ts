/**
 * MobileRuntimeState — the small, owned slice of SESSION facts the context
 * builder reads.
 *
 * Session log vs context (docs/CONTEXT_ENGINEERING.md): the session log is
 * the source of truth for "what happened"; this state is a derived,
 * budget-bounded projection of "what the model needs right now":
 * current device, current app, last action outcome, and a short ring of
 * recent observation summaries. It never stores full screens — observations
 * live in the session log as tool results.
 */

import type { ScreenState } from '../capability/types.ts'

/** One recorded tool action outcome. */
export interface ActionRecord {
  tool: string
  ok: boolean
  /** One-line summary (the ActionResult/summary or observe headline). */
  summary: string
  at: number
}

/** One compressed observation entry (never the full element list). */
export interface ObservationRecord {
  deviceId: string
  app?: string
  /** Element count and the first few salient labels. */
  headline: string
  at: number
}

const MAX_OBSERVATIONS = 5
const MAX_ACTIONS = 5

export class MobileRuntimeState {
  /** Provider backing the current session ('mock', 'mobile-mcp'). */
  providerName = 'unknown'
  /** Device id of the most recent observation, when any. */
  currentDeviceId: string | undefined
  /** Foreground app of the most recent observation, when any. */
  currentApp: string | undefined
  /** Screen resolution of the most recent observation, when any. */
  screen: { width: number; height: number } | undefined

  lastAction: ActionRecord | undefined
  readonly recentActions: ActionRecord[] = []
  readonly recentObservations: ObservationRecord[] = []

  /** Record one observation; returns nothing. */
  recordObservation(screen: ScreenState): void {
    this.currentDeviceId = screen.deviceId
    this.currentApp = screen.app?.packageName
    this.screen = screen.screen
    const salient = screen.elements
      .filter(el => el.text !== undefined)
      .slice(0, 4)
      .map(el => el.text)
      .join(' | ')
    this.recentObservations.push({
      deviceId: screen.deviceId,
      app: screen.app?.packageName,
      headline: `${screen.elements.length} elements${salient === '' ? '' : `: ${salient}`}`,
      at: screen.timestamp,
    })
    if (this.recentObservations.length > MAX_OBSERVATIONS) this.recentObservations.shift()
  }

  /** Record one mutating action outcome. */
  recordAction(tool: string, ok: boolean, summary: string): void {
    const record: ActionRecord = { tool, ok, summary, at: Date.now() }
    this.lastAction = record
    this.recentActions.push(record)
    if (this.recentActions.length > MAX_ACTIONS) this.recentActions.shift()
  }
}
