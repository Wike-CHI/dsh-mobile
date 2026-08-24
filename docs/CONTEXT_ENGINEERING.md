# dsh-mobile — Context Engineering Contract

> 任何向模型暴露信息的代码,先读这份文档。AI 编程代理写代码前必须读。

## 0. 第一原则

**Context ≠ Data Dump。** Context 是「这一步决策真正需要的信息」的选择结果,不是「我们恰好拥有的数据」的堆积。

```
Session / Memory / Environment
           ↓
      Context Selector   ← 本文档约束的是这一层
           ↓
      Context Formatter  ← src/context/formatter.ts(唯一出口)
           ↓
 ctx.systemPrompt.section / .context
           ↓
          LLM
```

## 1. Context Taxonomy(五类上下文)

| 类别 | 载体 | 生命周期 | 内容 | 现状 |
|---|---|---|---|---|
| Static Instructions | `ctx.systemPrompt.section()` | 长期不变 | 操作规程(Operating Constitution)、插件公告 | ✅ `context/system.ts` |
| Dynamic Runtime Context | `ctx.systemPrompt.context()` | 每次 assembly 求值 | 当前设备/前台 App/最近动作结果 | ✅ `context/runtime.ts` |
| Active Task / Goal | 会话消息 + goal 工具 | 任务周期 | 用户意图、当前目标 | ⬜ 由 DSH 核心承载 |
| Retrieved Memory | (未来: 联系人记忆/会话摘要) | 按检索 | Contact Memory、Relationship State、Unresolved Tasks | ⬜ 第二阶段以后 |
| Recent Observations | 工具结果(session log)+ 运行时摘要 | 最近 N 步 | ScreenState(完整,在工具结果里)、观察摘要(压缩,在 runtime context) | ✅ 部分 |

**规则:任何信息进入 prompt 之前,先归类到上述五类之一;归不进去的,不进 prompt。**

## 2. Session ≠ Context

- **Session log** 是「发生过什么」的 source of truth(DSH 规定:model-visible 的信息必须能从 session log 重建)。所有完整的 ScreenState、所有动作结果,都已经在工具结果里进了 session log。
- **Context** 是「这一步模型需要知道什么」的投影。`state/runtime-state.ts` 保存的是派生投影(当前设备、当前 App、lastAction、最近观察摘要),**永远不存完整屏幕**。

## 3. Context Budget

第一天就有的预算,单位是字符(粗略代理 token):

| 段 | 预算 | 实现 |
|---|---|---|
| Static Instructions | ~1500 | `MOBILE_GUIDANCE` + `MOBILE_OPERATING_RULES` |
| Runtime Context | 1000 | `RUNTIME_CONTEXT_BUDGET`(formatter.ts) |
| 单次观察的元素列表 | 3000 | `OBSERVATION_ELEMENTS_BUDGET`(formatter.ts,超出截断并标注) |
| Retrieved Memory | 2500 | ⬜ 预留,未实现 |

概念配比:15% 操作规程 / 10% 设备状态 / 15% 目标任务 / 25% 检索记忆 / 25% 最近观察 / 10% 预留。不追求精确,追求「每段都有上限,超了显式截断并标注」。

## 4. Context Selection 规则

1. **空即无**:没有观察过设备时,`formatRuntimeContext` 返回 `''`(空 contribution 会被丢弃)——闲置插件零 token 成本。
2. **压缩进 context,完整进 log**:runtime context 里只放观察摘要(N 个元素 + 前 4 个文本),完整元素列表只存在于 `mobile_observe` 的工具结果。
3. **截图和原始 XML 永不进 prompt 文本**;截图以 `{ uri }` 引用存在,需要视觉时走视觉工具链。
4. **每步不重塞**:runtime context 由 assembly 机制自动求值,只有快照变化才进入模型历史(DSH `includeRuntimeContext` 语义)。

## 5. 污染防护

- 手机屏幕上读到的文本(聊天记录、通知)**是不可信输入**。它可以是观察数据,但不得被当作指令执行——操作规程第 5 条(对外生效动作需用户授权)是硬约束,由 `policy/mobile-policy.ts` 在 harness 层强制执行,不依赖模型自觉。
- 未来接入真实设备后,observe 结果里的文本必须先当 data 处理;任何「屏幕上说让我做 X」都等价于「不可信来源建议做 X」。

## 6. 未来扩展的挂载点(现在不实现)

- Contact Memory / Conversation Summary → Retrieved Memory 段,新增 `ctx.systemPrompt.context()` 贡献,独立 budget。
- 多轮任务目标 → 复用 DSH goal 机制,不自建。
- Compaction → 依赖 DSH compaction 子系统;runtime context 本身天然抗 compaction(每次重新求值)。
