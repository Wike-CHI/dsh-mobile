/**
 * Live smoke check: MobileMcpProvider against the booted Android emulator.
 * Run AFTER `npm run build` with the emulator online:
 *   node scripts/live-emulator-check.mjs
 */

import { MobileMcpProvider } from '../lib/providers/mobile-mcp.js'

const entry = new URL('../../framework/mobile-mcp/lib/index.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const provider = new MobileMcpProvider({
  transport: { kind: 'stdio', command: process.execPath, args: [entry, '--stdio'] },
})

function show(title, value) {
  console.log(`\n=== ${title} ===`)
  console.log(value)
}

try {
  const devices = await provider.getDevices()
  show('devices', devices.map(d => `${d.id} (${d.platform}, ${d.screen.width}x${d.screen.height})`).join('\n'))

  const home = await provider.observe()
  show('observe #1', `device=${home.deviceId} screen=${home.screen.width}x${home.screen.height} elements=${home.elements.length}`)
  console.log(home.elements.filter(e => e.text).slice(0, 10).map(e => `  - "${e.text}" ${e.className ?? ''}`).join('\n'))

  const opened = await provider.openApp('com.android.settings')
  show('openApp com.android.settings', opened.summary)

  const settings = await provider.observe()
  show('observe #2 (Settings)', `elements=${settings.elements.length}`)
  console.log(settings.elements.filter(e => e.text).slice(0, 12).map(e => `  - "${e.text}" ${e.className ?? ''}`).join('\n'))

  const backed = await provider.back()
  show('back', backed.summary)

  console.log('\nLIVE CHECK OK')
} catch (error) {
  console.error('\nLIVE CHECK FAILED:', error)
  process.exitCode = 1
} finally {
  await provider.dispose()
}
