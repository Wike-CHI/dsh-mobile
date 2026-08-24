/**
 * mobile_back — navigate back. Tier 1 (navigation).
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { envelopeSchema, fail, ok, renderEnvelope, type ToolDeps } from './common.ts'

interface BackResult {
  status: 'success' | 'error'
  summary: string
  nextActions: string[]
}

export function mobileBackTool(deps: ToolDeps) {
  return defineTool({
    name: 'mobile_back',
    description: 'Press the device back button. Triggers: go back, return, exit this page.',
    parameters: {
      deviceId: { type: 'string', description: 'Target device id; omit for the default device.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { ...envelopeSchema },
      },
      render: (_args, value: BackResult) => renderEnvelope(value),
    },
    async execute(args: { deviceId?: string }) {
      try {
        const result = await deps.getMobile().back(args.deviceId)
        deps.state.recordAction('mobile_back', result.ok, result.summary)
        if (!result.ok) return fail(new Error(result.summary))
        return ok(result.summary, ['mobile_observe (confirm where back landed)'])
      } catch (error) {
        return fail(error)
      }
    },
  })
}
