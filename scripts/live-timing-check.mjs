import { MobileMcpProvider } from '../lib/providers/mobile-mcp.js'

const entry = new URL('../../framework/mobile-mcp/lib/index.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const p = new MobileMcpProvider({ transport: { kind: 'stdio', command: process.execPath, args: [entry, '--stdio'] } })

async function timed(label, fn) {
  const t0 = Date.now()
  const r = await fn()
  console.log(`${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  return r
}

try {
  await timed('observe #1 (cold: spawn + screen-size)', () => p.observe())
  await timed('observe #2 (screen-size cached)', () => p.observe())
  await timed('observe #3 (screen-size cached)', () => p.observe())
} finally {
  await p.dispose()
}
