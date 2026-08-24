import { MobileMcpProvider } from '../lib/providers/mobile-mcp.js'

const entry = new URL('../../framework/mobile-mcp/lib/index.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const p = new MobileMcpProvider({ transport: { kind: 'stdio', command: process.execPath, args: [entry, '--stdio'] } })

try {
  console.log('open:', (await p.openApp('com.android.settings')).summary)
  const tap = await p.tap({ text: 'Apps' })
  console.log('tap Apps:', JSON.stringify(tap))
  const after = await p.observe()
  console.log('after-tap elements:', after.elements.length)
  console.log(after.elements.filter(e => e.text).slice(0, 8).map(e => '  - ' + e.text).join('\n'))
  const miss = await p.tap({ text: '不存在的元素xyz' })
  console.log('missing-tap:', JSON.stringify(miss))
  console.log('back:', (await p.back()).summary)
} finally {
  await p.dispose()
}
