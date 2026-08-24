/**
 * Static prompt contributions (docs/CONTEXT_ENGINEERING.md, "Static
 * Instructions"):
 *
 * - `plugin:dsh-mobile`  — presence announcement: what the plugin is, what it
 *                          can and cannot do. Silenceable via config.
 * - `dsh-mobile:behavior` — the OPERATING CONSTITUTION: long-term behavioral
 *                          invariants for driving a phone. Never carries
 *                          current device facts (those live in runtime.ts).
 *
 * Both ride ctx.systemPrompt.section() and are re-assembled every step.
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** Tool-guidance band convention: 100–199. */
const SECTION_ORDER = 150

/** Model-facing announcement: presence, capabilities, limits. */
export const MOBILE_GUIDANCE = `本机已安装 dsh-mobile 插件(移动设备操作能力):通过 mobile_* 工具观察并操作手机。能力:mobile_observe 读取当前屏幕(前台应用 + 归一化 UI 元素列表);mobile_open_app 打开应用;mobile_tap 点击(优先用 elementId/text,坐标是最后手段);mobile_type 输入文本(只是草稿,永远不会发送/提交/发布);mobile_back 返回。限制:发送消息、发布内容、点赞关注、支付、删除账号等对外生效操作属于更高权限层级,当前版本默认拒绝;当前执行后端为 mock provider(模拟设备),mobile-mcp 真实设备适配在第二阶段接入。用户提到「手机 / 屏幕 / 打开应用 / 点一下 / 看看手机上」时即指本插件,请据此协作。`

/** Operating constitution: behavioral invariants, not data. */
export const MOBILE_OPERATING_RULES = `You can operate a mobile device through mobile_* tools.

Operating rules:

1. Observe before acting when screen state is uncertain; never invent UI elements that were not observed.
2. Prefer semantic targets (elementId, exact text) over raw coordinates.
3. Do not assume an action succeeded — verify important actions with mobile_observe.
4. mobile_type enters a draft only; it never sends, submits, or publishes.
5. Externally consequential actions (sending messages, posting, paying, deleting) are denied by policy unless the user explicitly authorizes them — ask first, and never work around the denial.
6. If device state differs from expectation, observe again before continuing.`

export function registerMobileContext(ctx: Context, options: { announce: boolean }): void {
  if (options.announce) {
    ctx.systemPrompt.section({
      name: 'plugin:dsh-mobile',
      order: SECTION_ORDER,
      text: MOBILE_GUIDANCE,
    })
  }
  ctx.systemPrompt.section({
    name: 'dsh-mobile:behavior',
    order: SECTION_ORDER + 1,
    text: MOBILE_OPERATING_RULES,
  })
}
