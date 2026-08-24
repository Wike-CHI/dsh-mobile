import { describe, expect, it } from 'vitest'
import { MockMobileProvider } from '../src/providers/mock.ts'

describe('MockMobileProvider', () => {
  it('lists one mock device', async () => {
    const provider = new MockMobileProvider()
    const devices = await provider.getDevices()
    expect(devices).toHaveLength(1)
    expect(devices[0]?.id).toBe('mock-device')
    expect(devices[0]?.screen).toEqual({ width: 1080, height: 2400 })
  })

  it('observes the launcher initially', async () => {
    const provider = new MockMobileProvider()
    const screen = await provider.observe()
    expect(screen.app?.packageName).toBe('com.android.launcher')
    expect(screen.elements.some(el => el.text === '聊天')).toBe(true)
  })

  it('runs the full loop: openApp -> tap contact -> type draft -> send -> back', async () => {
    const provider = new MockMobileProvider()

    const opened = await provider.openApp('com.example.chat')
    expect(opened.ok).toBe(true)
    expect((await provider.observe()).app?.packageName).toBe('com.example.chat')

    const tapped = await provider.tap({ text: '张三' })
    expect(tapped.ok).toBe(true)
    const detail = await provider.observe()
    expect(detail.app?.activity).toBe('.ChatActivity')
    expect(detail.elements.some(el => el.editable === true)).toBe(true)

    const typed = await provider.type('好,七点见')
    expect(typed.ok).toBe(true)
    expect(typed.summary).toContain('NOT sent')

    // Draft visible in the input element, not yet a message.
    const withDraft = await provider.observe()
    expect(withDraft.elements.find(el => el.id === 'input')?.text).toBe('好,七点见')

    const sent = await provider.tap({ elementId: 'send' })
    expect(sent.ok).toBe(true)
    const afterSend = await provider.observe()
    expect(afterSend.elements.some(el => el.text === '我: 好,七点见')).toBe(true)

    const backed = await provider.back()
    expect(backed.ok).toBe(true)
    expect((await provider.observe()).app?.activity).toBe('.MainActivity')
  })

  it('rejects unknown apps and unknown tap targets with structured errors', async () => {
    const provider = new MockMobileProvider()
    const badApp = await provider.openApp('com.nonexistent')
    expect(badApp.ok).toBe(false)
    expect(badApp.error).toBe('APP_NOT_FOUND')

    const badTap = await provider.tap({ text: '不存在的按钮' })
    expect(badTap.ok).toBe(false)
    expect(badTap.error).toBe('ELEMENT_NOT_FOUND')
  })

  it('refuses to type when no editable element exists', async () => {
    const provider = new MockMobileProvider()
    const result = await provider.type('hello')
    expect(result.ok).toBe(false)
    expect(result.error).toBe('NOT_EDITABLE')
  })

  it('resolves coordinate taps through element bounds', async () => {
    const provider = new MockMobileProvider()
    const result = await provider.tap({ x: 500, y: 350 }) // inside icon-chat row
    expect(result.ok).toBe(true)
    expect((await provider.observe()).app?.packageName).toBe('com.example.chat')
  })
})
