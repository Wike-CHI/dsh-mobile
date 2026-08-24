/**
 * mobile_tap — tap a semantic target or raw coordinates. Tier 1 (navigation).
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { TapTarget } from '../capability/types.ts'
import { envelopeSchema, fail, ok, renderEnvelope, type ToolDeps } from './common.ts'

interface TapResult {
  status: 'success' | 'error'
  summary: string
  nextActions: string[]
}

interface TapArgs {
  elementId?: string
  text?: string
  x?: number
  y?: number
  deviceId?: string
}

/** Exactly-one targeting mode -> TapTarget, or an error message. */
export function resolveTapArgs(args: TapArgs): TapTarget | string {
  if (args.elementId !== undefined) return { elementId: args.elementId }
  if (args.text !== undefined) return { text: args.text }
  if (args.x !== undefined && args.y !== undefined) return { x: args.x, y: args.y }
  return 'provide exactly one target: elementId, text, or x+y coordinates'
}

export function mobileTapTool(deps: ToolDeps) {
  return defineTool({
    name: 'mobile_tap',
    description: 'Tap a UI element. Prefer elementId or text from a recent mobile_observe result over raw coordinates. ' +
      'A tap only clicks what is on screen NOW; observe again if the screen may have changed. ' +
      'Triggers: tap, click, press a button, open a conversation.',
    parameters: {
      elementId: { type: 'string', description: 'Element id from mobile_observe (most reliable).' },
      text: { type: 'string', description: 'Exact visible text of the element to tap.' },
      x: { type: 'integer', description: 'Raw X coordinate (last resort; requires y).' },
      y: { type: 'integer', description: 'Raw Y coordinate (last resort; requires x).' },
      deviceId: { type: 'string', description: 'Target device id; omit for the default device.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { ...envelopeSchema },
      },
      render: (_args, value: TapResult) => renderEnvelope(value),
    },
    async execute(args: TapArgs) {
      const target = resolveTapArgs(args)
      if (typeof target === 'string') {
        return { status: 'error', summary: target, nextActions: ['mobile_observe'] } satisfies TapResult
      }
      try {
        const result = await deps.getMobile().tap(target, args.deviceId)
        deps.state.recordAction('mobile_tap', result.ok, result.summary)
        if (!result.ok) {
          return {
            status: 'error',
            summary: `${result.summary} (hint: ${result.error ?? 'unknown'})`,
            nextActions: ['mobile_observe (re-read the screen, then tap an element that exists)'],
          } satisfies TapResult
        }
        return ok(result.summary, ['mobile_observe (verify the tap had the intended effect)'])
      } catch (error) {
        return fail(error)
      }
    },
  })
}
