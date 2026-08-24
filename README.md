# dsh-mobile

DeepSeek Harness 的移动设备能力插件:让 DSH Agent 通过统一的 `MobileService`
能力缝观察并操作手机。

**Phase 1(已完成)**:MobileService 能力缝 + Mock + 5 工具 + Context/Policy 契约。
**Phase 2(已完成)**:MobileMcpProvider 经 MCP 协议接真实 Android 模拟器,已实机验证。
**不在范围内**:自动聊天、联系人记忆、微信/小红书等上层应用。

## 闭环演示

```
用户:「看看当前手机屏幕是什么状态」
   ↓ DeepSeek Harness
   ↓ dsh-mobile plugin
mobile_observe()
   ↓ Mock Provider(phase 2: mobile-mcp)
结构化 ScreenState
   ↓
DSH 基于结果继续行动(open_app → tap → type(草稿)→ back)
```

## 结构

```
src/
├── capability/    MobileService 定义 + ScreenState/UIElement 类型(核心资产)
├── providers/     mock.ts(脚本化聊天 App)| mobile-mcp.ts(MCP → 真实设备,已验证)
├── tools/         mobile_observe / open_app / tap / type / back
├── context/       system.ts(操作规程)+ runtime.ts(<mobile_runtime>)+ formatter.ts(唯一格式化出口)
├── policy/        Tier 0-4 权限(guard 硬拒绝 + pre-execute ask)
└── state/         MobileRuntimeState(派生投影,非 session)

docs/
├── CONTEXT_ENGINEERING.md    Context 分类/预算/选择/污染防护
└── HARNESS_ARCHITECTURE.md   能力缝/工具面/权限面/生命周期/版本纪律
```

## 开发

```bash
npm install
npm run typecheck
npm test
npm run build
```

## 安装进 DSH profile

```bash
dsh plugin --profile <name> add link:J:/ai/phone-agent/dsh-mobile
```

配置(可选):

```yaml
# profile 的 cordis.yml 中该插件行
- id: mobile
  name: dsh-mobile
  config:
    provider: mock        # mock(默认,离线)| mobile-mcp(真实设备,已验证)
    deviceId: emulator-5554  # 可选,mobile-mcp 专用;缺省取第一台在线设备
    announceToAgent: true # 在 system prompt 中公告插件
    enabled: true
```

## 验收标准

> 输入「查看当前手机状态」,DSH 能自己选择 `mobile_observe`,拿到结构化
> Mock ScreenState,并基于结果正确解释当前 UI。

## Roadmap

1. ✅ Phase 1:MobileService + Mock + 5 工具 + Context/Policy 契约
2. ✅ Phase 2:MobileMcpProvider 经 MCP 协议接真实 Android 模拟器
   (2026-08-22 在 Medium_Phone_API_36.0 / emulator-5554 验证:
   devices → observe(28 元素)→ openApp Settings → observe(69 元素)→
   语义 tap 'Apps' → ELEMENT_NOT_FOUND 错误路径 → back)
3. ⬜ Phase 3:`mobile_swipe` 工具暴露、截图观察、前台 App 感知(需 ADB provider)、多设备
4. ⬜ Phase 4:Tier-3 发送能力(接 approval)+ Retrieved Memory(联系人/会话摘要)

## 真实设备验证(Phase 2)

```bash
# 1. 构建 vendored mobile-mcp(npmmirror 缺 mobilecli,需官方 registry)
cd ../framework/mobile-mcp
npm install --ignore-scripts --registry=https://registry.npmjs.org
npx tsc

# 2. 启动模拟器(或接真机 adb)
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Medium_Phone_API_36.0

# 3. 本包构建 + 离线测试
cd ../../dsh-mobile && npm run build && npm test

# 4. 真实设备冒烟(不动 DSH,直接打 provider)
node scripts/live-emulator-check.mjs
node scripts/live-tap-check.mjs
```
