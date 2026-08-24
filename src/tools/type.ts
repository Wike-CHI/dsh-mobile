/**
 * mobile_type — enter text into an editable element. Tier 2 (draft/input).
 *
 * HARD CONTRACT: typing NEVER submits. Sending a message, publishing a post,
 * or submitting a form is a Tier-3 external-effect capability that does not
 * exist in this package yet — the policy layer (policy/mobile-policy.ts)
 * denies it by default when it arrives.
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { envelopeSchema, fail, ok, renderEnvelope, type ToolDeps } from './common.ts'

interface TypeResult {
  status: 'success' | 'error'
  summary: string
  nextActions: string[]
}

export function mobileTypeTool(deps: ToolDeps) {
  return defineTool({
    name: 'mobile_type',
    description: 'Type text into the focused (or only) editable element on screen. ' +
      'This enters a DRAFT only — it never sends, submits, or publishes. ' +
      'Triggers: type, enter text, write a draft, fill in a field.',
    parameters: {
      text: { type: 'string', required: true, description: 'The exact text to enter.' },
      deviceId: { type: 'string', description: 'Target device id; omit for the default device.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { ...envelopeSchema },
      },
      render: (_args, value: TypeResult) => renderEnvelope(value),
    },
    async execute(args: { text: string; deviceId?: string }) {
      try {
        const result = await deps.getMobile().type(args.text, args.deviceId)
        deps.state.recordAction('mobile_type', result.ok, result.summary)
        if (!result.ok) {
          return {
            status: 'error',
            summary: `${result.summary} (hint: ${result.error ?? 'unknown'})`,
            nextActions: ['mobile_observe', 'mobile_tap an editable element first'],
          } satisfies TypeResult
        }
        return ok(result.summary, [
          'mobile_observe (show the draft to the user before any send action)',
        ])
      } catch (error) {
        return fail(error)
      }
    },
  })
}
