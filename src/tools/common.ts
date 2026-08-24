/**
 * Shared tool plumbing: the result envelope every mobile_* tool returns.
 *
 * Per the observation-design rules this package follows, EVERY tool result
 * carries: status, a one-line summary, and actionable next_actions — plus the
 * tool-specific payload. Errors are returned in the same envelope with a
 * root-cause hint, not thrown, so the model always gets a recovery path.
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { MobileError, type MobileService } from '../capability/mobile.ts'
import type { MobileRuntimeState } from '../state/runtime-state.ts'

/** Dependencies handed to every tool factory. */
export interface ToolDeps {
  /** Resolve the current provider per call so provider swaps are picked up. */
  getMobile: () => MobileService
  state: MobileRuntimeState
}

/** The uniform envelope (payload fields are added per tool). */
export interface Envelope {
  status: 'success' | 'error'
  summary: string
  nextActions: string[]
}

/** JSON-Schema fragment of the envelope, spread into each tool's output schema. */
export const envelopeSchema = {
  status: { type: 'string', enum: ['success', 'error'], required: true },
  summary: { type: 'string', required: true },
  nextActions: { type: 'array', items: { type: 'string' }, required: true },
} as const

/** One text content block (the only render shape these tools emit). */
export function text(value: string): ContentBlock[] {
  return [{ type: 'text', text: value }]
}

/** Render an envelope as `summary` + next-actions hint lines. */
export function renderEnvelope(value: Envelope, detail?: string): ContentBlock[] {
  const lines = [value.summary]
  if (detail !== undefined && detail !== '') lines.push('', detail)
  if (value.nextActions.length > 0) {
    lines.push('', `next: ${value.nextActions.join(' | ')}`)
  }
  return text(lines.join('\n'))
}

/** Build a success envelope. */
export function ok(summary: string, nextActions: string[]): Envelope {
  return { status: 'success', summary, nextActions }
}

/** Build an error envelope from any thrown failure, with recovery hints. */
export function fail(error: unknown): Envelope {
  if (error instanceof MobileError) {
    const hint = {
      NO_DEVICE: 'attach a device or switch to the mock provider',
      DEVICE_NOT_FOUND: 'call mobile_observe without deviceId to use the default device',
      APP_NOT_FOUND: 'check the package name; the mock provider knows com.example.chat',
      ELEMENT_NOT_FOUND: 'call mobile_observe again and pick an element that exists',
      NOT_EDITABLE: 'tap an editable element first, or navigate to a screen with one',
      PROVIDER_UNAVAILABLE: 'check the provider configuration (provider: mock works offline)',
      NOT_IMPLEMENTED: 'this capability is not implemented in the current provider',
    }[error.code]
    return { status: 'error', summary: `${error.message} (hint: ${hint})`, nextActions: ['mobile_observe'] }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { status: 'error', summary: `unexpected failure: ${message}`, nextActions: ['mobile_observe'] }
}
