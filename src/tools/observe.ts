/**
 * mobile_observe — the ONE way the model sees the device. Tier 0 (read-only).
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { formatScreenForModel } from '../context/formatter.ts'
import type { ScreenState } from '../capability/types.ts'
import { envelopeSchema, fail, ok, renderEnvelope, type ToolDeps } from './common.ts'

type ObserveResult = ReturnType<typeof resultShape>
function resultShape() {
  return { status: 'success' as const, summary: '', nextActions: [] as string[], screen: undefined as ScreenState | undefined }
}

/** JSON Schema of the normalized ScreenState payload. */
const screenSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    deviceId: { type: 'string', required: true },
    app: {
      type: 'object',
      additionalProperties: false,
      properties: {
        packageName: { type: 'string', required: true },
        activity: { type: 'string' },
      },
    },
    screen: {
      type: 'object',
      additionalProperties: false,
      required: true,
      properties: {
        width: { type: 'integer', required: true },
        height: { type: 'integer', required: true },
      },
    },
    elements: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          description: { type: 'string' },
          className: { type: 'string' },
          bounds: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              left: { type: 'integer', required: true },
              top: { type: 'integer', required: true },
              right: { type: 'integer', required: true },
              bottom: { type: 'integer', required: true },
            },
          },
          clickable: { type: 'boolean' },
          editable: { type: 'boolean' },
          scrollable: { type: 'boolean' },
        },
      },
    },
    screenshot: {
      type: 'object',
      additionalProperties: false,
      properties: { uri: { type: 'string', required: true } },
    },
    timestamp: { type: 'integer', required: true },
  },
} as const

export function mobileObserveTool(deps: ToolDeps) {
  return defineTool({
    name: 'mobile_observe',
    description: 'Inspect the current state of the mobile device screen: foreground app and the normalized UI element list. ' +
      'Read-only. Always observe before acting when screen state is uncertain, and after an action whose result matters. ' +
      'Triggers: check phone screen, what is on the phone, current app, find a button/contact/message.',
    parameters: {
      deviceId: { type: 'string', description: 'Target device id; omit for the default device.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ...envelopeSchema,
          screen: screenSchema,
        },
      },
      render: (_args, value: ObserveResult) => renderEnvelope(
        value,
        value.screen !== undefined ? formatScreenForModel(value.screen) : undefined,
      ),
    },
    async execute(args: { deviceId?: string }) {
      try {
        const screen = await deps.getMobile().observe(args.deviceId)
        deps.state.recordObservation(screen)
        const next: string[] = []
        if (screen.elements.some(el => el.clickable === true)) next.push('mobile_tap')
        if (screen.elements.some(el => el.editable === true)) next.push('mobile_type (draft only, never sends)')
        next.push('mobile_open_app', 'mobile_back')
        return {
          ...ok(`observed ${screen.app?.packageName ?? 'unknown app'}: ${screen.elements.length} elements`, next),
          screen,
        }
      } catch (error) {
        return fail(error)
      }
    },
  })
}
