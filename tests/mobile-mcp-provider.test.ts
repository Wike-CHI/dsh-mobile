import { describe, expect, it } from 'vitest'
import {
  mapElement,
  parseDevicesResponse,
  parseElementsResponse,
  parseScreenSize,
  swipeToDirection,
} from '../src/providers/mobile-mcp.ts'

describe('mobile-mcp wire parsing', () => {
  it('parses the devices JSON payload', () => {
    const devices = parseDevicesResponse(JSON.stringify({
      devices: [
        { id: 'emulator-5554', name: 'Medium Phone', platform: 'android', type: 'emulator', state: 'online' },
      ],
    }))
    expect(devices).toHaveLength(1)
    expect(devices[0]?.id).toBe('emulator-5554')
  })

  it('parses the screen-size sentence', () => {
    expect(parseScreenSize('Screen size is 1080x2400 pixels')).toEqual({ width: 1080, height: 2400 })
  })

  it('parses the elements list after its prose prefix', () => {
    const payload = 'Found these elements on screen: [{"type":"android.widget.Button","text":"OK","coordinates":{"x":10,"y":20,"width":100,"height":40}}]'
    const elements = parseElementsResponse(payload)
    expect(elements).toHaveLength(1)
  })
})

describe('mapElement normalization', () => {
  it('maps coordinates to bounds and infers flags from the widget class', () => {
    const button = mapElement({
      type: 'android.widget.Button',
      text: '发送',
      identifier: 'com.example.chat:id/send',
      coordinates: { x: 880, y: 2020, width: 200, height: 160 },
    })
    expect(button.id).toBe('com.example.chat:id/send')
    expect(button.text).toBe('发送')
    expect(button.bounds).toEqual({ left: 880, top: 2020, right: 1080, bottom: 2180 })
    expect(button.clickable).toBe(true)
    expect(button.editable).toBeUndefined()

    const edit = mapElement({
      type: 'android.widget.EditText',
      label: '输入消息',
      coordinates: { x: 0, y: 2000, width: 860, height: 160 },
    })
    expect(edit.editable).toBe(true)
    expect(edit.text).toBe('输入消息')

    const list = mapElement({
      type: 'androidx.recyclerview.widget.RecyclerView',
      coordinates: { x: 0, y: 0, width: 1080, height: 2000 },
    })
    expect(list.scrollable).toBe(true)
  })

  it('prefers text, falls back to label, keeps distinct label as description', () => {
    const el = mapElement({
      type: 'android.widget.TextView',
      text: '张三',
      label: '联系人张三,2条未读',
      coordinates: { x: 0, y: 300, width: 1080, height: 200 },
    })
    expect(el.text).toBe('张三')
    expect(el.description).toBe('联系人张三,2条未读')
  })
})

describe('swipeToDirection', () => {
  it('picks the dominant axis and preserves start + distance', () => {
    expect(swipeToDirection({ start: { x: 500, y: 1800 }, end: { x: 500, y: 600 } }))
      .toEqual({ direction: 'up', x: 500, y: 1800, distance: 1200 })
    expect(swipeToDirection({ start: { x: 100, y: 500 }, end: { x: 900, y: 520 } }))
      .toEqual({ direction: 'right', x: 100, y: 500, distance: 800 })
  })
})
