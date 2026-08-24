# dsh-mobile

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

**Give your DeepSeek Harness agent eyes and hands on a phone.**
dsh-mobile is a mobile device capability plugin: the agent observes the live screen as a
structured UI tree (no screenshots, no vision model, zero image tokens) and acts through
five safe tools — observe, open app, tap, type (draft only), back.

[中文文档](README.zh.md)

> **Demo placeholder** — a 30s GIF of the agent driving a real Android emulator goes here.
> This is the single highest-conversion asset; record one before promoting.

## Why not screenshots?

Most phone-agent stacks feed screenshots to a vision model: slow, expensive, and brittle.
dsh-mobile drives apps from the native **accessibility tree** via
[mobile-mcp](https://github.com/mobile-next/mobile-mcp):

- **Fast** — one observe returns the full UI element list in milliseconds
- **Cheap** — structured text, no image tokens
- **Reliable** — semantic taps by element id/text, not fragile coordinates

## The loop

```
User: "What's on my phone right now?"
   ↓ DeepSeek Harness
   ↓ dsh-mobile plugin
mobile_observe()
   ↓ mock provider (offline) / mobile-mcp provider (real device)
structured ScreenState { app, elements[] }
   ↓
Agent keeps acting: open_app → tap → type (draft) → back
```

## Status

- ✅ **Phase 1** — MobileService capability seam, mock provider, 5 agent tools, context/policy contracts
- ✅ **Phase 2** — MobileMcpProvider over the MCP protocol, verified on a real Android emulator
  (2026-08-22, Medium_Phone_API_36.0 / emulator-5554: devices → observe (28 elements) →
  openApp Settings → observe (69 elements) → semantic tap 'Apps' → ELEMENT_NOT_FOUND error path → back)
- ⬜ **Phase 3** — `mobile_swipe`, screenshot observation, foreground-app awareness (ADB provider), multi-device
- ⬜ **Phase 4** — Tier-3 send capability (approval-gated), retrieved memory (contacts/conversation summaries)

**Out of scope**: auto-chatting, contact memory, WeChat/RED and other app-level automation.

## Tools

| Tool | What it does |
|---|---|
| `mobile_observe` | Foreground app + normalized UI element list (read-only) |
| `mobile_open_app` | Launch an app by package name or alias |
| `mobile_tap` | Tap by element id / exact text (coordinates as last resort) |
| `mobile_type` | Enter a **draft** only — never sends, submits, or publishes |
| `mobile_back` | Press the device back button |

## Safety by design

Externally consequential actions (sending messages, posting, paying, deleting accounts)
are **denied by policy** unless the user explicitly authorizes them:

- **Tier 0–4 permission model** — guard-level hard rejects + pre-execute asks
- `mobile_type` enters drafts only; publishing is out of reach of the tool surface
- Every tool result is structured and auditable

## Install

```bash
# into a DSH profile
dsh plugin --profile <name> add link:J:/ai/phone-agent/dsh-mobile
```

Optional configuration (the plugin row in the profile's `cordis.yml`):

```yaml
- id: mobile
  name: dsh-mobile
  config:
    provider: mock           # mock (default, offline) | mobile-mcp (real device)
    deviceId: emulator-5554  # optional, mobile-mcp only; defaults to first online device
    announceToAgent: true    # announce the plugin in the system prompt
    enabled: true
```

## Real-device verification (Phase 2)

```bash
# 1. Build the vendored mobile-mcp (use the official npm registry)
cd ../framework/mobile-mcp
npm install --ignore-scripts --registry=https://registry.npmjs.org
npx tsc

# 2. Start an emulator (or attach a real device via adb)
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Medium_Phone_API_36.0

# 3. Build this package + offline tests
cd ../../dsh-mobile && npm run build && npm test

# 4. Live smoke tests against the provider directly
node scripts/live-emulator-check.mjs
node scripts/live-tap-check.mjs
```

## Architecture

```
src/
├── capability/    MobileService definition + ScreenState/UIElement types (the core asset)
├── providers/     mock.ts (scripted chat app) | mobile-mcp.ts (MCP → real device)
├── tools/         mobile_observe / open_app / tap / type / back
├── context/       system.ts (operating rules) + runtime.ts (<mobile_runtime>) + formatter.ts
├── policy/        Tier 0–4 permissions (guard hard-rejects + pre-execute asks)
└── state/         MobileRuntimeState (derived projection, not session state)

docs/
├── CONTEXT_ENGINEERING.md    Context classification / budgets / selection / pollution guards
└── HARNESS_ARCHITECTURE.md   Capability seams / tool surface / policy / lifecycle / versioning
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Acceptance

> Given "check my phone's current state", the agent picks `mobile_observe` on its own,
> receives a structured ScreenState, and correctly explains the current UI.

## License

Apache-2.0
