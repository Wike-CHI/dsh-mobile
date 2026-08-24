/**
 * mobile_open_app — launch an application. Tier 1 (navigation).
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { envelopeSchema, fail, ok, renderEnvelope, type ToolDeps } from './common.ts'

interface OpenAppResult {
  status: 'success' | 'error'
  summary: string
  nextActions: string[]
}

export function mobileOpenAppTool(deps: ToolDeps) {
  return defineTool({
    name: 'mobile_open_app',
    description: 'Launch an application on the mobile device by package name (e.g. com.example.chat). ' +
      'Triggers: open app, launch, start WeChat/chat/photos.',
    parameters: {
      app: { type: 'string', required: true, description: 'Package name or provider-known alias (mock knows "chat").' },
      deviceId: { type: 'string', description: 'Target device id; omit for the default device.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { ...envelopeSchema },
      },
      render: (_args, value: OpenAppResult) => renderEnvelope(value),
    },
    async execute(args: { app: string; deviceId?: string }) {
      try {
        const result = await deps.getMobile().openApp(args.app, args.deviceId)
        deps.state.recordAction('mobile_open_app', result.ok, result.summary)
        if (!result.ok) return fail(new Error(result.summary + (result.error !== undefined ? ` [${result.error}]` : '')))
        return ok(result.summary, ['mobile_observe (verify the app actually opened)'])
      } catch (error) {
        return fail(error)
      }
    },
  })
}
