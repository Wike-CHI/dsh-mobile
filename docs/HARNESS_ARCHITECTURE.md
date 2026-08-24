# dsh-mobile — Harness Architecture Contract

> 任何改动执行面(Provider)、工具面(Tools)、权限面(Policy)的代码,先读这份文档。

## 0. 分层

```
                   DSH Agent Loop
                         │
                         ▼
                     Tool Call
                         │
                         ▼
                 tools/pre-execute ──────┐
                         │               │  Policy(src/policy/)
                   allow / ask / deny ◄──┘  ask→approval seam, deny→guard(单调)
                         │
                         ▼
                 Tool Consumer(src/tools/)     ← model-facing:5 个 mobile_* 工具
                         │
                         ▼
                   ctx.mobile                 ← Capability Definition(src/capability/)
                         │
              ┌──────────┴──────────┐
              │                     │
       Mock Provider         MCP Provider(phase 2)
       (providers/mock.ts)   (providers/mobile-mcp.ts)
                                    │
                               mobile-mcp
                                    │
                             Android Emulator
```

**核心资产是 `src/capability/`(MobileService + 类型)。** mobile-mcp、ADB、
uiautomator2、Appium、云手机,全都只是 Provider。上层永远不见 Provider 的
wire 格式——归一化规则只属于 Provider 内部。

## 1. Capability Seam

```
Service Definition   src/capability/mobile.ts   MobileService 接口 + Context 扩展
Service Provider     src/providers/*            ctx.provide('mobile', provider)
Consumer             src/tools/*                ctx.get('mobile') 每次调用时解析
```

- 消费方**每次执行时** `ctx.get('mobile')`,不缓存引用——Provider 热替换不需要重注册工具。
- 环境性失败(无设备/元素不存在/App 未安装)**不抛异常**:变更类方法返回
  `ActionResult { ok: false, error }`;观察类抛 `MobileError`(带可路由 code),
  由工具的 `fail()` 转成带恢复提示的 envelope。

## 2. Action Space(工具面)

Phase 1 只有 5 个工具,多一个都不加:

| 工具 | Tier | 说明 |
|---|---|---|
| `mobile_observe` | 0 | 唯一观察入口;返回 ScreenState(JSON)+ 人类可读渲染 |
| `mobile_open_app` | 1 | 按包名/别名启动 |
| `mobile_tap` | 1 | elementId > text > 坐标(最后手段) |
| `mobile_type` | 2 | 只产生草稿,**契约上永不提交** |
| `mobile_back` | 1 | 返回 |

工具设计规则(来自 observation-design 约定):

1. 每个工具结果都是统一 envelope:`status` / `summary` / `nextActions` + payload。
2. 错误不裸抛:同一 envelope 返回,带 root-cause hint 和下一步建议。
3. `output.schema` 声明天 JSON Schema,`output.render` 管模型可读文本——结构化数据进 log,渲染文本进对话。
4. 工具 schema 窄而显式;不造 catch-all 工具。

## 3. Policy(权限面)

**Prompt 是软约束,Harness 是硬约束。** 「不要乱发消息」写在 prompt 里只是建议;
写在 `policy/mobile-policy.ts` 里才是系统属性。

| Tier | 类别 | 机制 | 默认 |
|---|---|---|---|
| 0 | read | — | auto |
| 1 | navigation | — | auto |
| 2 | draft/input | 工具契约(type 永不提交) | auto |
| 3 | external effect | `tools/pre-execute` waterfall → `{ kind: 'ask' }`,走部署的 approval seam;无 approval 通道时降级为 deny | ask |
| 4 | high-risk | `ctx.tools.guard()` 单调拒绝,任何 allow 都无法覆盖 | deny |

- 新的 `mobile_*` 动词**默认 Tier 3(fail-closed)**,必须在 `TOOL_TIERS` 里显式降级。
- Phase 1 没有 Tier 3/4 工具,但管线已经就位——加 `mobile_send` 的那天不需要动 policy 框架。

## 4. Context Plane(摘要,详见 CONTEXT_ENGINEERING.md)

- Static:`ctx.systemPrompt.section()` × 2(公告 + 操作规程,order 150/151)。
- Dynamic:`ctx.systemPrompt.context()` `<mobile_runtime>`,空观察时返回 `''`(零 token)。
- 格式化唯一出口:`src/context/formatter.ts`,预算硬编码在其中。

## 5. Lifecycle / 可逆性

- 所有注册(工具、section、context、guard、pre-execute 监听)都挂在插件 fiber 上
  (`ctx.effect` / 注册 API 返回的 disposer),插件卸载即全部回收。
- 入口 `src/index.ts` 保持薄:选 Provider → `ctx.provide` → 四个 register 调用。
- `enabled: false` 时整个插件不注册任何面。

## 6. Provider 切换

`Config.provider`: `'mock'`(默认,离线可用)| `'mobile-mcp'`(真实设备,已验证)。
切换只改配置,不动上层。

**mobile-mcp provider(2026-08-22 在 emulator-5554 / Medium_Phone_API_36.0 实锤)**:

- transport:MCP stdio,spawn 本仓 `framework/mobile-mcp` 构建出的 `lib/index.js`
  (npmmirror 缺 `mobilecli@1.0.0` → 需 `--registry=https://registry.npmjs.org` 安装后 `npx tsc` 构建)。
- 归一化:`mobile_list_elements_on_screen` 的文本 JSON → `UIElement[]`;
  clickable/editable/scrollable 从 widget className 推断;wire 局限:**mobile-mcp
  没有前台 App 查询 → ScreenState.app 为 undefined**(mock 有,未来 ADB provider 可补)。
- 语义点击在 provider 内解析:elementId/text → 新鲜 observe → 元素中心坐标 →
  `mobile_click_on_screen_at_coordinates`。
- `type` 硬编码 `submit: false`(草稿契约);`back` → `mobile_press_button BACK`。
- adb 发现:stdio 子进程 PATH 自动 prepend `%LOCALAPPDATA%\Android\Sdk\platform-tools`。
- 资源配置:`mobileMcpPath`(server 入口)、`deviceId`(默认设备)。

验证脚本:`scripts/live-emulator-check.mjs`(devices/observe/openApp/back)、
`scripts/live-tap-check.mjs`(语义 tap + ELEMENT_NOT_FOUND 路径)。

## 7. 安装

```bash
cd dsh-mobile && npm install && npm run build
dsh plugin --profile <name> add link:J:/ai/phone-agent/dsh-mobile
```

`cordis.patch.yml` 以 bundle patch 形式把插件行插入 profile roster,不修改 DSH 源码。

## 8. 版本纪律

DSH 处于 Developer Preview,breaking change 是常态:

- devDependencies 锁定到具体 minor(`^0.1.0-rc.6` / `^4.0.1`),升级是显式动作。
- 所有 DSH-specific API(`defineTool`、`systemPrompt`、`tools.guard`)只允许出现在
  tools/、context/、policy/、index.ts——capability/、providers/、state/ **禁止 import
  任何 @deepseek-ai 包**,保证核心资产可独立测试、可迁移。

## 9. Error Recovery & Observability

- 每个错误路径:root-cause hint + 安全重试建议 + 停止条件(见 `tools/common.ts` 的 `fail()`)。
- `MobileRuntimeState` 记录最近 5 个动作 + 5 个观察摘要,既喂 runtime context,
  也是排障的第一现场。session log(工具结果)是完整事实源。
- **mobile-mcp 自愈**(2026-08-22 实战教训):mobile-mcp server 可能因页面加载期的
  uiautomator dump 同步阻塞而整体僵死(连 `list_available_devices` 也超时)。
  `callText` 遇到传输层失败(超时/断连)会先 `resetConnection()`(关 client、杀子进程),
  再抛出带「server was reset; retry」提示的错误——**下一次调用自动 spawn 新 server**,
  一次重试即恢复,不需要重启 DSH。
- **中文输入法陷阱**(同日实战):模拟器使用中文 IME 时,ASCII 键流会进入拼音组合、
  不提交;`.`、` ` 等标点变全角。对策:输入后加**尾部空格**强制提交候选词;
  观察时若输入框看似空白,可能是有未提交的组合在缓冲,下一次提交会全部落盘。
- **devicekit 中文直输**(同日解决):mobile-mcp 的非 ASCII 输入依赖设备端
  `com.mobilenext.devicekit`(剪贴板广播 `devicekit.clipboard.set`,base64 投递后粘贴,
  不切换 IME)。安装:`devicekit.apk`(release 1.2.5,GitHub 直连不通时走 ghfast.top 镜像,
  已存 `framework/devicekit.apk`)→ `adb install -r`。装好后 `mobilecli io text` 中文直输可用。
